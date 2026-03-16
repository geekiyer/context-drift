import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { globSync } from "node:fs";
import type { AIProvider } from "../ai/provider.js";
import type { CheckResult, CheckerContext } from "./types.js";

interface Section {
	file: string;
	heading: string;
	startLine: number;
	endLine: number;
	content: string;
}

function splitIntoSections(content: string, fileName: string): Section[] {
	const lines = content.split("\n");
	const sections: Section[] = [];
	let currentHeading = "(preamble)";
	let currentStart = 1;
	let currentLines: string[] = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (/^#{1,3}\s/.test(line)) {
			if (currentLines.some((l) => l.trim().length > 0)) {
				sections.push({
					file: fileName,
					heading: currentHeading,
					startLine: currentStart,
					endLine: i,
					content: currentLines.join("\n"),
				});
			}
			currentHeading = line.replace(/^#+\s*/, "").trim();
			currentStart = i + 1;
			currentLines = [line];
		} else {
			currentLines.push(line);
		}
	}

	if (currentLines.some((l) => l.trim().length > 0)) {
		sections.push({
			file: fileName,
			heading: currentHeading,
			startLine: currentStart,
			endLine: lines.length,
			content: currentLines.join("\n"),
		});
	}

	return sections;
}

/**
 * Extract file/path references from a section's content so we can read
 * the actual source files that the section talks about.
 */
function extractReferencedPaths(sectionContent: string): string[] {
	const paths: string[] = [];

	// Match backtick-wrapped paths with extensions: `src/foo.ts`, `app/_layout.tsx`
	const backtickPaths = sectionContent.matchAll(/`([a-zA-Z0-9_.\-/]+\.[a-zA-Z]{1,10})`/g);
	for (const m of backtickPaths) {
		paths.push(m[1]);
	}

	// Match backtick-wrapped directory paths: `src/components/`, `hooks/`
	const backtickDirs = sectionContent.matchAll(/`([a-zA-Z0-9_.\-/]+\/)`/g);
	for (const m of backtickDirs) {
		paths.push(m[1]);
	}

	// Match tree-diagram file entries: ├── foo.tsx, └── bar.ts
	const treeFiles = sectionContent.matchAll(/[├└]──\s+([a-zA-Z0-9_.\-/[\]]+\.[a-zA-Z]{1,10})/g);
	for (const m of treeFiles) {
		paths.push(m[1]);
	}

	// Match tree-diagram directory entries: ├── components/, └── hooks/
	const treeDirs = sectionContent.matchAll(/[├└]──\s+([a-zA-Z0-9_.\-/]+)\//g);
	for (const m of treeDirs) {
		paths.push(m[1] + "/");
	}

	return [...new Set(paths)];
}

/**
 * Given a list of referenced paths, resolve them against the repo root
 * and read their contents. For directories, list their files.
 * Returns a string of code context.
 */
function gatherTargetedContext(repoRoot: string, referencedPaths: string[]): string {
	const parts: string[] = [];
	let totalChars = 0;
	const charBudget = 30000; // keep context under ~8k tokens

	for (const refPath of referencedPaths) {
		if (totalChars > charBudget) break;

		const fullPath = join(repoRoot, refPath);

		if (refPath.endsWith("/")) {
			// Directory: list its contents
			if (existsSync(fullPath)) {
				try {
					const entries = readdirSync(fullPath).slice(0, 20);
					const listing = entries.join(", ");
					const chunk = `## ${refPath}\nContents: ${listing}`;
					parts.push(chunk);
					totalChars += chunk.length;
				} catch {}
			}
		} else if (existsSync(fullPath)) {
			// File: read it (up to 100 lines)
			try {
				const content = readFileSync(fullPath, "utf-8");
				const fileLines = content.split("\n");
				const preview = fileLines.slice(0, 100).join("\n");
				const truncated = fileLines.length > 100 ? ` (first 100 of ${fileLines.length} lines)` : "";
				const chunk = `## ${refPath}${truncated}\n\`\`\`\n${preview}\n\`\`\``;
				parts.push(chunk);
				totalChars += chunk.length;
			} catch {}
		} else {
			// Try to find it by searching common parent dirs
			const found = tryFindFile(repoRoot, refPath);
			if (found) {
				try {
					const content = readFileSync(found, "utf-8");
					const fileLines = content.split("\n");
					const preview = fileLines.slice(0, 100).join("\n");
					const rel = relative(repoRoot, found);
					const truncated = fileLines.length > 100 ? ` (first 100 of ${fileLines.length} lines)` : "";
					const chunk = `## ${rel}${truncated}\n\`\`\`\n${preview}\n\`\`\``;
					parts.push(chunk);
					totalChars += chunk.length;
				} catch {}
			}
		}
	}

	return parts.join("\n\n");
}

/**
 * Try to find a file that might be referenced with a partial path.
 * e.g., "utils.ts" might be at "src/utils.ts" or "lib/utils.ts"
 */
function tryFindFile(repoRoot: string, partialPath: string): string | null {
	// Only try for files with extensions (not directories)
	if (!extname(partialPath)) return null;

	const searchDirs = ["src", "app", "lib", "components", "hooks", "constants", "utils", ""];
	for (const dir of searchDirs) {
		const candidate = join(repoRoot, dir, partialPath);
		if (existsSync(candidate)) return candidate;
	}
	return null;
}

/**
 * Gather baseline repo context: structure, dependencies, scripts.
 * This is the "always included" context, supplemented by targeted file reads per section.
 */
function gatherBaselineContext(repoRoot: string): string {
	const parts: string[] = [];

	// Directory structure (3 levels deep for better coverage)
	const dirSummary = collectDirStructure(repoRoot, 3);
	parts.push("## Directory structure\n" + dirSummary);

	// Package.json (full deps + scripts)
	const pkgPath = join(repoRoot, "package.json");
	if (existsSync(pkgPath)) {
		try {
			const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
			const deps = pkg.dependencies || {};
			const devDeps = pkg.devDependencies || {};
			const scripts = pkg.scripts || {};
			parts.push(
				`## package.json\nDependencies: ${JSON.stringify(deps, null, 2)}\nDevDependencies: ${JSON.stringify(devDeps, null, 2)}\nScripts: ${JSON.stringify(scripts, null, 2)}`,
			);
		} catch {}
	}

	// Python manifests
	for (const pyFile of ["requirements.txt", "pyproject.toml", "Pipfile"]) {
		const pyPath = join(repoRoot, pyFile);
		if (existsSync(pyPath)) {
			try {
				const content = readFileSync(pyPath, "utf-8").slice(0, 3000);
				parts.push(`## ${pyFile}\n\`\`\`\n${content}\n\`\`\``);
			} catch {}
		}
	}

	// Go/Rust manifests
	for (const manifest of ["go.mod", "Cargo.toml"]) {
		const mPath = join(repoRoot, manifest);
		if (existsSync(mPath)) {
			try {
				const content = readFileSync(mPath, "utf-8").slice(0, 3000);
				parts.push(`## ${manifest}\n\`\`\`\n${content}\n\`\`\``);
			} catch {}
		}
	}

	// Makefile targets
	const makefilePath = join(repoRoot, "Makefile");
	if (existsSync(makefilePath)) {
		try {
			const content = readFileSync(makefilePath, "utf-8").slice(0, 3000);
			parts.push(`## Makefile\n\`\`\`\n${content}\n\`\`\``);
		} catch {}
	}

	return parts.join("\n\n");
}

function collectDirStructure(root: string, maxDepth: number, depth = 0, prefix = ""): string {
	if (depth >= maxDepth) return "";
	const lines: string[] = [];
	const skipDirs = new Set([
		"node_modules", "dist", "build", "out", "__pycache__",
		".git", ".next", ".expo", "coverage", ".turbo", "target",
	]);
	try {
		const entries = readdirSync(root)
			.filter((e) => !e.startsWith(".") || e === ".github")
			.filter((e) => !skipDirs.has(e));
		for (const entry of entries.slice(0, 30)) {
			const fullPath = join(root, entry);
			try {
				const stat = statSync(fullPath);
				if (stat.isDirectory()) {
					lines.push(`${prefix}${entry}/`);
					lines.push(collectDirStructure(fullPath, maxDepth, depth + 1, prefix + "  "));
				} else {
					lines.push(`${prefix}${entry}`);
				}
			} catch {}
		}
	} catch {}
	return lines.filter(Boolean).join("\n");
}

const SYSTEM_PROMPT = `You are a strict code accuracy checker. You compare claims in AI context files (CLAUDE.md, AGENTS.md, etc.) against evidence from the actual codebase.

Your job: find claims that CONTRADICT the evidence. You must have concrete proof from the provided code/structure to flag something.

Respond ONLY with a JSON array. Each element:
{
  "line": <line number of the wrong claim>,
  "claim": "<the specific claim that is wrong>",
  "reality": "<what the code evidence actually shows, with file references>",
  "severity": "warning" or "error"
}

STRICT RULES — read every one carefully:

1. ONLY flag claims you can PROVE are wrong using concrete evidence from the provided code. You need a specific file, line, or structural fact that contradicts the claim.
2. If you cannot find evidence about a claim (the relevant file was not provided, or you're unsure), you MUST skip it. "I don't see it in the code provided" is NOT a valid reason to flag something.
3. Do NOT flag style guidelines, conventions, or instructions ("always use X", "never do Y") — these are rules for developers, not factual claims about what exists.
4. Do NOT flag comparisons or analogies ("mirrors Next.js conventions") — these reference other tech without claiming it as a dependency.
5. Do NOT flag aspirational statements, TODOs, "Phase 2" plans, or anything clearly about future work.
6. Do NOT flag file structure diagrams or path references — a separate checker handles those.
7. Do NOT flag a claim if your own analysis confirms it is correct. Only include items that are WRONG.
8. "error" = would cause an AI agent to write incorrect code (wrong file name, wrong API, wrong dependency version). "warning" = outdated or imprecise but wouldn't cause a hard failure.
9. Keep "reality" to one sentence. Cite the specific file and what it actually shows.
10. Return an empty array [] if nothing is provably wrong. An empty array is a GOOD result.

Err heavily on the side of returning []. A false positive is worse than a missed issue.`;

export async function checkSemantic(
	context: CheckerContext,
	provider: AIProvider,
	model?: string,
): Promise<CheckResult[]> {
	const results: CheckResult[] = [];
	const baselineContext = gatherBaselineContext(context.repoRoot);

	const contextFiles = [...new Set(context.claims.map((c) => c.file))];

	for (const fileName of contextFiles) {
		const filePath = join(context.repoRoot, fileName);
		if (!existsSync(filePath)) continue;

		const content = readFileSync(filePath, "utf-8");
		const sections = splitIntoSections(content, fileName);

		// Skip sections that are too short or purely prescriptive (rules/guidelines)
		const prescriptiveHeadings = /\b(rules|guidelines|conventions|instructions|style guide|do not|never|always|coding standards)\b/i;
		const substantiveSections = sections.filter((s) => {
			const textLines = s.content.split("\n").filter((l) => l.trim().length > 0 && !l.startsWith("#"));
			if (textLines.length < 2) return false;
			// Skip sections that are purely rules/instructions (not verifiable claims)
			if (prescriptiveHeadings.test(s.heading)) return false;
			return true;
		});

		// Batch sections, but gather targeted context per batch
		const batches: Section[][] = [];
		for (let i = 0; i < substantiveSections.length; i += 3) {
			batches.push(substantiveSections.slice(i, i + 3));
		}

		for (const batch of batches) {
			// Extract file references from this batch's sections and read them
			const allRefs: string[] = [];
			for (const section of batch) {
				allRefs.push(...extractReferencedPaths(section.content));
			}
			const targetedContext = gatherTargetedContext(context.repoRoot, [...new Set(allRefs)]);

			const sectionText = batch
				.map((s) => `### "${s.heading}" (lines ${s.startLine}-${s.endLine})\n${s.content}`)
				.join("\n\n---\n\n");

			const userPrompt = `# Repository baseline\n\n${baselineContext}\n\n# Relevant source files\n\n${targetedContext || "(no specific files referenced in this section)"}\n\n---\n\n# Sections from "${fileName}" to check (lines are 1-indexed from start of file)\n\n${sectionText}`;

			try {
				const response = await provider.chat(
					[
						{ role: "system", content: SYSTEM_PROMPT },
						{ role: "user", content: userPrompt },
					],
					model,
				);

				const issues = parseAIResponse(response, fileName);
				results.push(...issues);
			} catch (err) {
				results.push({
					checker: "semantic",
					code: "AI_CHECK_ERROR",
					severity: "info",
					file: fileName,
					message: `AI check failed: ${err instanceof Error ? err.message : String(err)}`,
				});
			}
		}
	}

	return results;
}

function parseAIResponse(response: string, fileName: string): CheckResult[] {
	try {
		const jsonMatch = response.match(/\[[\s\S]*\]/);
		if (!jsonMatch) return [];

		const issues = JSON.parse(jsonMatch[0]);
		if (!Array.isArray(issues)) return [];

		// Filter out results where the model hedges, speculates, or contradicts itself
		const lowConfidencePatterns = [
			// Model confirms the claim is correct
			/matches the claim/i,
			/claim is accurate/i,
			/which is correct/i,
			/aligns with/i,
			// Model admits it can't prove the issue
			/cannot be (conclusively )?proven/i,
			/no (clear |direct )?evidence.*(?:but|however)/i,
			/not directly addressed/i,
			/outside the.*content/i,
			/does not contain any.*reference/i,
			/we infer/i,
			/not (provided|included) in the (provided )?(?:code|files|context)/i,
			// Hedging / speculation
			/\bmight\b.*\b(be|have|still|exist|require)\b/i,
			/\bcould\b.*\b(be|have|potentially|exist)\b/i,
			/\bpossibly\b/i,
			/\bpotentially\b/i,
			/suggests? that/i,
			/it('s| is) (possible|likely|unclear)/i,
			/there('s| is) no (specific |explicit )?check/i,
			/may (still |not )/i,
			/without direct evidence/i,
			/not in line with/i,
			/this is not in/i,
			// Model talking about what the docs say vs what it can verify
			/does not provide (specific|concrete|clear)/i,
			/doesn't (show|provide|include)/i,
			/no explicit (mention|reference|example|command)/i,
			/there are no references/i,
			/however.*not (implemented|included|reflected)/i,
			/area for future development/i,
		];

		return issues
			.filter((i: Record<string, unknown>) => i.claim && i.reality)
			.filter((i: Record<string, unknown>) => {
				const reality = String(i.reality);
				return !selfContradictPatterns.some((p) => p.test(reality));
			})
			.map((i: Record<string, unknown>) => ({
				checker: "semantic",
				code: "SEMANTIC_DRIFT",
				severity: (i.severity === "error" ? "error" : "warning") as "error" | "warning",
				file: fileName,
				line: typeof i.line === "number" ? i.line : undefined,
				message: String(i.reality),
				claimed: String(i.claim),
				actual: String(i.reality),
			}));
	} catch {
		return [];
	}
}

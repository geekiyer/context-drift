import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import simpleGit from "simple-git";
import { resolveProvider } from "./ai/provider.js";
import { checkCommands } from "./checkers/command.js";
import { checkCrossFile } from "./checkers/cross-file.js";
import { checkDependencies } from "./checkers/dependency.js";
import { checkPaths } from "./checkers/path.js";
import { checkSemantic } from "./checkers/semantic.js";
import { checkStaleness } from "./checkers/staleness.js";
import type {
	CheckerContext,
	CheckResult,
	Claim,
	Config,
	FileResult,
	ScanResult,
	StalenessInfo,
} from "./checkers/types.js";
import { discoverContextFiles, loadConfig } from "./config.js";
import { parseCargoToml } from "./parsers/cargo-toml.js";
import { parseContextFile } from "./parsers/context-file.js";
import { parseGoMod } from "./parsers/go-mod.js";
import { parsePackageJson } from "./parsers/package-json.js";
import { parsePythonManifests } from "./parsers/pyproject.js";

function getVersion(): string {
	try {
		const __filename = fileURLToPath(import.meta.url);
		const __dirname = dirname(__filename);
		const pkgPath = join(__dirname, "..", "package.json");
		const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
		return pkg.version;
	} catch {
		return "0.0.0";
	}
}

const VERSION = getVersion();

export async function scan(
	repoRoot: string,
	configOverrides?: Partial<Config>,
): Promise<ScanResult> {
	const config = { ...loadConfig(repoRoot), ...configOverrides };
	const contextFiles = discoverContextFiles(repoRoot, config);

	if (contextFiles.length === 0) {
		return {
			version: VERSION,
			filesScanned: 0,
			results: [],
			summary: { errors: 0, warnings: 0 },
			score: 100,
		};
	}

	// Parse manifests
	const manifests = new Map<string, unknown>();
	const pkgJson = parsePackageJson(repoRoot);
	if (pkgJson) manifests.set("package-json", pkgJson);
	const python = parsePythonManifests(repoRoot);
	if (python) manifests.set("python", python);
	const goMod = parseGoMod(repoRoot);
	if (goMod) manifests.set("go", goMod);
	const cargo = parseCargoToml(repoRoot);
	if (cargo) manifests.set("cargo", cargo);

	// Parse claims from all context files
	const allClaims: Claim[] = [];
	for (const file of contextFiles) {
		const filePath = join(repoRoot, file);
		const claims = parseContextFile(filePath, file);
		allClaims.push(...claims);
	}

	// Get staleness info
	const stalenessMap = new Map<string, StalenessInfo>();
	for (const file of contextFiles) {
		const info = await getStalenessInfo(repoRoot, file);
		stalenessMap.set(file, info);
	}

	// Build checker context
	const checkerContext: CheckerContext = {
		repoRoot,
		claims: allClaims,
		manifests,
		staleness: stalenessMap,
		config,
	};

	// Run all deterministic checkers
	const allIssues: CheckResult[] = [
		...checkStaleness(checkerContext),
		...checkPaths(checkerContext),
		...checkCommands(checkerContext),
		...checkDependencies(checkerContext),
		...checkCrossFile(checkerContext),
	];

	// Run AI semantic checker if enabled
	if (config.ai.enabled) {
		const provider = resolveProvider({
			provider: config.ai.provider,
			model: config.ai.model,
		});
		const semanticIssues = await checkSemantic(
			checkerContext,
			provider,
			config.ai.model,
		);
		allIssues.push(...semanticIssues);
	}

	// Filter ignored issues
	const filteredIssues = allIssues.filter(
		(issue) => !isIgnored(issue, config.ignore),
	);

	// Group results by file
	const fileResults: FileResult[] = contextFiles.map((file) => ({
		file,
		staleness: stalenessMap.get(file) ?? null,
		issues: filteredIssues.filter((i) => i.file === file),
	}));

	const summary = {
		errors: filteredIssues.filter((i) => i.severity === "error").length,
		warnings: filteredIssues.filter((i) => i.severity === "warning").length,
	};

	const score = computeDriftScore(summary, stalenessMap);

	return {
		version: VERSION,
		filesScanned: contextFiles.length,
		results: fileResults,
		summary,
		score,
	};
}

async function getStalenessInfo(
	repoRoot: string,
	file: string,
): Promise<StalenessInfo> {
	try {
		const git = simpleGit(repoRoot);
		const isRepo = await git.checkIsRepo();
		if (!isRepo) {
			return { lastModified: null, commitsSince: 0, daysSince: 0 };
		}

		// Get last modification date of the file
		const log = await git.log({ file, maxCount: 1 });
		if (!log.latest) {
			return { lastModified: null, commitsSince: 0, daysSince: 0 };
		}

		const lastModified = new Date(log.latest.date);
		const daysSince = Math.floor(
			(Date.now() - lastModified.getTime()) / (1000 * 60 * 60 * 24),
		);

		// Count commits since the file was last modified
		const allLogs = await git.log({ from: log.latest.hash, to: "HEAD" });
		const commitsSince = allLogs.total;

		return { lastModified, commitsSince, daysSince };
	} catch {
		return { lastModified: null, commitsSince: 0, daysSince: 0 };
	}
}

function computeDriftScore(
	summary: { errors: number; warnings: number },
	staleness: Map<string, StalenessInfo>,
): number {
	let score = 100;

	// Issue penalties
	score -= summary.errors * 10;
	score -= summary.warnings * 3;

	// Staleness penalties per file
	for (const info of staleness.values()) {
		if (info.daysSince > 90) {
			score -= 3;
		} else if (info.daysSince > 30) {
			score -= 1;
		}
	}

	return Math.max(0, Math.min(100, score));
}

function isIgnored(issue: CheckResult, ignoreRules: Config["ignore"]): boolean {
	return ignoreRules.some((rule) => {
		if (rule.code !== issue.code) return false;
		if (rule.file && rule.file !== issue.file) return false;
		if (rule.line != null && rule.line !== issue.line) return false;
		if (rule.pattern && issue.claimed) {
			const regex = new RegExp(
				rule.pattern.replace(/\*/g, ".*").replace(/\?/g, "."),
			);
			if (!regex.test(issue.claimed)) return false;
		}
		return true;
	});
}

import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { commitSemanticChecks } from "./checkers/semantic.js";
import { generateDefaultConfig } from "./config.js";
import { reportConsole } from "./reporters/console.js";
import { reportGitHubAnnotations } from "./reporters/github-annotations.js";
import { reportJson } from "./reporters/json.js";
import { scan, scanPrepare } from "./scanner.js";

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

const program = new Command()
	.name("context-drift")
	.description(
		"Detect when AI context files drift out of sync with your codebase",
	)
	.version(VERSION);

program
	.command("scan")
	.description("Scan repo for context drift")
	.argument("[path]", "Path to repo root", ".")
	.option(
		"--format <format>",
		"Output format: console, json, github",
		"console",
	)
	.option("--strict", "Treat warnings as errors (exit 1)")
	.option("--config <path>", "Path to config file")
	.option("--ai", "Enable AI-powered semantic checks")
	.option("--provider <provider>", "AI provider: anthropic, openai, ollama")
	.option("--model <model>", "AI model to use (provider-specific)")
	.action(
		async (
			path: string,
			options: {
				format: string;
				strict?: boolean;
				config?: string;
				ai?: boolean;
				provider?: string;
				model?: string;
			},
		) => {
			const repoRoot = resolve(path);
			const configOverrides: Record<string, unknown> = {};
			if (options.strict) {
				configOverrides.strict = true;
			}
			if (options.ai) {
				configOverrides.ai = {
					enabled: true,
					provider: options.provider,
					model: options.model,
				};
			}

			try {
				const result = await scan(repoRoot, configOverrides);

				let output: string;
				switch (options.format) {
					case "json":
						output = reportJson(result);
						break;
					case "github":
						output = reportGitHubAnnotations(result);
						break;
					default:
						output = reportConsole(result);
				}

				console.log(output);

				// Exit code logic
				if (result.summary.errors > 0) {
					process.exit(1);
				}
				if (options.strict && result.summary.warnings > 0) {
					process.exit(1);
				}
			} catch (err) {
				console.error("Error:", err instanceof Error ? err.message : err);
				process.exit(2);
			}
		},
	);

program
	.command("version")
	.description("Print version")
	.action(() => {
		console.log(VERSION);
	});

program
	.command("init")
	.description("Generate a starter .context-drift.yml")
	.action(() => {
		const configPath = resolve(".context-drift.yml");
		if (existsSync(configPath)) {
			console.error(".context-drift.yml already exists");
			process.exit(2);
		}
		writeFileSync(configPath, generateDefaultConfig());
		console.log("Created .context-drift.yml");
	});

program
	.command("prepare")
	.description("Build LLM prompts for semantic checks (outputs JSON to stdout)")
	.argument("[path]", "Path to repo root", ".")
	.action((path: string) => {
		try {
			const repoRoot = resolve(path);
			const requests = scanPrepare(repoRoot);
			console.log(JSON.stringify(requests, null, 2));
		} catch (err) {
			console.error("Error:", err instanceof Error ? err.message : err);
			process.exit(2);
		}
	});

program
	.command("commit")
	.description(
		"Process LLM responses into check results (reads JSON from stdin)",
	)
	.action(async () => {
		try {
			const chunks: Buffer[] = [];
			for await (const chunk of process.stdin) {
				chunks.push(chunk);
			}
			const input = Buffer.concat(chunks).toString();
			const responses = JSON.parse(input);

			if (!Array.isArray(responses)) {
				console.error("Error: expected a JSON array of responses");
				process.exit(2);
			}

			const results = commitSemanticChecks(responses);
			console.log(JSON.stringify(results, null, 2));
		} catch (err) {
			console.error("Error:", err instanceof Error ? err.message : err);
			process.exit(2);
		}
	});

program
	.command("setup")
	.description("Install the /drift-check skill and optional auto-check hook")
	.option(
		"--global",
		"Install to ~/.claude/skills instead of project .claude/skills",
	)
	.option(
		"--hook",
		"Also install a session-start hook that warns when drift is detected",
	)
	.action((options: { global?: boolean; hook?: boolean }) => {
		try {
			const __filename = fileURLToPath(import.meta.url);
			const __dirname = dirname(__filename);
			const skillSource = join(
				__dirname,
				"..",
				"skills",
				"drift-check",
				"SKILL.md",
			);

			if (!existsSync(skillSource)) {
				console.error(
					"Error: skill file not found in package. Try reinstalling @geekiyer/context-drift.",
				);
				process.exit(2);
			}

			// Determine target directory
			const base = options.global
				? join(process.env.HOME || "~", ".claude")
				: resolve(".claude");
			const skillDir = join(base, "skills", "drift-check");
			mkdirSync(skillDir, { recursive: true });

			const skillTarget = join(skillDir, "SKILL.md");
			copyFileSync(skillSource, skillTarget);
			const scope = options.global ? "global" : "project";
			console.log(`Installed /drift-check skill to ${skillDir} (${scope})`);

			// Install hook if requested
			if (options.hook) {
				const settingsPath = join(base, "settings.json");
				let settings: Record<string, unknown> = {};
				if (existsSync(settingsPath)) {
					settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
				}

				const hookCommand =
					"context-drift scan . --format json 2>/dev/null | node -e \"let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const r=JSON.parse(d);const n=r.summary.errors+r.summary.warnings;if(n>0)console.log('Context drift detected (score: '+r.score+'/100, '+r.summary.errors+' errors, '+r.summary.warnings+' warnings). Run /drift-check to see details and fix.')}catch{}})\"";

				const hooks = (settings.hooks || {}) as Record<string, unknown[]>;
				const existing = (hooks.PreToolUse || []) as Record<string, string>[];

				// Don't add duplicate
				if (!existing.some((h) => h.command?.includes("context-drift scan"))) {
					existing.push({ matcher: "", command: hookCommand });
					hooks.PreToolUse = existing;
					settings.hooks = hooks;
					writeFileSync(settingsPath, JSON.stringify(settings, null, "\t"));
					console.log(`Installed auto-check hook to ${settingsPath}`);
					console.log(
						"Claude Code will warn you when context files drift at the start of each session.",
					);
				} else {
					console.log("Auto-check hook already installed.");
				}
			}

			console.log(
				"\nUsage: type /drift-check in Claude Code to check for drift.",
			);
		} catch (err) {
			console.error("Error:", err instanceof Error ? err.message : err);
			process.exit(2);
		}
	});

program.parse();

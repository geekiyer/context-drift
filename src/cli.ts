import { existsSync, readFileSync, writeFileSync } from "node:fs";
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

program.parse();

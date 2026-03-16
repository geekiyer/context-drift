import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkCommands } from "../../src/checkers/command.js";
import type { CheckerContext, Config } from "../../src/checkers/types.js";
import { parseContextFile } from "../../src/parsers/context-file.js";
import { parsePackageJson } from "../../src/parsers/package-json.js";

const FIXTURES = join(import.meta.dirname, "../fixtures");

const defaultConfig: Config = {
	files: [],
	staleness: {
		warnDays: 30,
		warnCommits: 50,
		errorDays: 90,
		errorCommits: 200,
	},
	ignore: [],
	strict: false,
};

describe("checkCommands", () => {
	it("flags dead npm scripts", () => {
		const repoRoot = join(FIXTURES, "node-project");
		const claims = parseContextFile(join(repoRoot, "CLAUDE.md"), "CLAUDE.md");
		const manifests = new Map<string, unknown>();
		const pkg = parsePackageJson(repoRoot);
		if (pkg) manifests.set("package-json", pkg);

		const ctx: CheckerContext = {
			repoRoot,
			claims,
			manifests,
			staleness: new Map(),
			config: defaultConfig,
		};

		const results = checkCommands(ctx);

		// test:e2e doesn't exist in scripts
		expect(
			results.some(
				(r) => r.code === "DEAD_COMMAND" && r.message.includes("test:e2e"),
			),
		).toBe(true);
	});

	it("does not flag existing scripts", () => {
		const repoRoot = join(FIXTURES, "node-project");
		const claims = parseContextFile(join(repoRoot, "CLAUDE.md"), "CLAUDE.md");
		const manifests = new Map<string, unknown>();
		const pkg = parsePackageJson(repoRoot);
		if (pkg) manifests.set("package-json", pkg);

		const ctx: CheckerContext = {
			repoRoot,
			claims,
			manifests,
			staleness: new Map(),
			config: defaultConfig,
		};

		const results = checkCommands(ctx);

		// build and lint exist
		expect(results.some((r) => r.message.includes('"build"'))).toBe(false);
		expect(results.some((r) => r.message.includes('"lint"'))).toBe(false);
	});

	it("flags pnpm scripts that don't exist", () => {
		const repoRoot = join(FIXTURES, "node-project");
		const claims = parseContextFile(join(repoRoot, "CLAUDE.md"), "CLAUDE.md");
		const manifests = new Map<string, unknown>();
		const pkg = parsePackageJson(repoRoot);
		if (pkg) manifests.set("package-json", pkg);

		const ctx: CheckerContext = {
			repoRoot,
			claims,
			manifests,
			staleness: new Map(),
			config: defaultConfig,
		};

		const results = checkCommands(ctx);

		// "pnpm format" — format script doesn't exist
		expect(
			results.some(
				(r) => r.code === "DEAD_COMMAND" && r.message.includes("format"),
			),
		).toBe(true);
	});
});

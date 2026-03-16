import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { checkDependencies } from "../../src/checkers/dependency.js";
import { parseContextFile } from "../../src/parsers/context-file.js";
import { parsePackageJson } from "../../src/parsers/package-json.js";
import type { CheckerContext, Config } from "../../src/checkers/types.js";

const FIXTURES = join(import.meta.dirname, "../fixtures");

const defaultConfig: Config = {
	files: [],
	staleness: { warnDays: 30, warnCommits: 50, errorDays: 90, errorCommits: 200 },
	ignore: [],
	strict: false,
};

describe("checkDependencies", () => {
	it("flags missing dependencies", () => {
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

		const results = checkDependencies(ctx);

		// express is claimed but not in package.json (hono is there instead)
		expect(results.some((r) => r.code === "MISSING_DEPENDENCY" && r.claimed?.toLowerCase().includes("express"))).toBe(true);
	});

	it("flags version mismatches", () => {
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

		const results = checkDependencies(ctx);

		// React 18 is claimed but package.json has react 19
		expect(results.some((r) => r.code === "STALE_DEPENDENCY" && r.claimed?.toLowerCase().includes("react"))).toBe(true);
	});

	it("does not flag matching dependencies", () => {
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

		const results = checkDependencies(ctx);

		// typescript and vitest are in both places
		expect(results.some((r) => r.claimed?.includes("typescript"))).toBe(false);
		expect(results.some((r) => r.claimed?.includes("vitest"))).toBe(false);
	});
});

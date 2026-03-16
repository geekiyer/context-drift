import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { checkPaths } from "../../src/checkers/path.js";
import { parseContextFile } from "../../src/parsers/context-file.js";
import type { CheckerContext, Config } from "../../src/checkers/types.js";

const FIXTURES = join(import.meta.dirname, "../fixtures");

const defaultConfig: Config = {
	files: [],
	staleness: { warnDays: 30, warnCommits: 50, errorDays: 90, errorCommits: 200 },
	ignore: [],
	strict: false,
};

describe("checkPaths", () => {
	it("flags missing paths", () => {
		const repoRoot = join(FIXTURES, "node-project");
		const claims = parseContextFile(join(repoRoot, "CLAUDE.md"), "CLAUDE.md");
		const ctx: CheckerContext = {
			repoRoot,
			claims,
			manifests: new Map(),
			staleness: new Map(),
			config: defaultConfig,
		};

		const results = checkPaths(ctx);
		const missingPaths = results.filter((r) => r.code === "MISSING_PATH");

		expect(missingPaths.some((r) => r.claimed === "src/nonexistent")).toBe(true);
	});

	it("does not flag existing paths", () => {
		const repoRoot = join(FIXTURES, "node-project");
		const claims = parseContextFile(join(repoRoot, "CLAUDE.md"), "CLAUDE.md");
		const ctx: CheckerContext = {
			repoRoot,
			claims,
			manifests: new Map(),
			staleness: new Map(),
			config: defaultConfig,
		};

		const results = checkPaths(ctx);
		expect(results.some((r) => r.claimed === "src/components")).toBe(false);
		expect(results.some((r) => r.claimed === "src/services")).toBe(false);
		expect(results.some((r) => r.claimed === "src/utils/helpers.ts")).toBe(false);
	});
});

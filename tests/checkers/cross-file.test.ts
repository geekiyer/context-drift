import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { checkCrossFile } from "../../src/checkers/cross-file.js";
import { parseContextFile } from "../../src/parsers/context-file.js";
import type { CheckerContext, Config } from "../../src/checkers/types.js";

const FIXTURES = join(import.meta.dirname, "../fixtures");

const defaultConfig: Config = {
	files: [],
	staleness: { warnDays: 30, warnCommits: 50, errorDays: 90, errorCommits: 200 },
	ignore: [],
	strict: false,
};

describe("checkCrossFile", () => {
	it("detects conflicting test commands across files", () => {
		const repoRoot = join(FIXTURES, "multi-file");
		const claims = [
			...parseContextFile(join(repoRoot, "CLAUDE.md"), "CLAUDE.md"),
			...parseContextFile(join(repoRoot, "AGENTS.md"), "AGENTS.md"),
		];

		const ctx: CheckerContext = {
			repoRoot,
			claims,
			manifests: new Map(),
			staleness: new Map(),
			config: defaultConfig,
		};

		const results = checkCrossFile(ctx);
		const conflicts = results.filter((r) => r.code === "CROSS_FILE_CONFLICT");

		expect(conflicts.length).toBeGreaterThan(0);
		expect(conflicts.some((r) => r.message.includes("test"))).toBe(true);
	});
});

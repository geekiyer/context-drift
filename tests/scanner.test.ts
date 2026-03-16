import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { scan } from "../src/scanner.js";

const FIXTURES = join(import.meta.dirname, "fixtures");

describe("scan", () => {
	it("scans a node project and finds issues", async () => {
		const result = await scan(join(FIXTURES, "node-project"));

		expect(result.version).toMatch(/^\d+\.\d+\.\d+$/);
		expect(result.filesScanned).toBe(1); // CLAUDE.md
		expect(result.results).toHaveLength(1);

		const claudeResult = result.results[0];
		expect(claudeResult.file).toBe("CLAUDE.md");

		// Should find missing paths, dead commands, dependency issues
		const codes = claudeResult.issues.map((i) => i.code);
		expect(codes).toContain("MISSING_PATH");
		expect(codes).toContain("DEAD_COMMAND");
	});

	it("returns empty results when no context files exist", async () => {
		const result = await scan(join(FIXTURES, "node-project/src"));
		expect(result.filesScanned).toBe(0);
		expect(result.results).toHaveLength(0);
	});

	it("scans multi-file projects and finds cross-file conflicts", async () => {
		const result = await scan(join(FIXTURES, "multi-file"));

		expect(result.filesScanned).toBe(2); // CLAUDE.md + AGENTS.md
		expect(result.results).toHaveLength(2);

		const allIssues = result.results.flatMap((r) => r.issues);
		expect(allIssues.some((i) => i.code === "CROSS_FILE_CONFLICT")).toBe(true);
	});
});

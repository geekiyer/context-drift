import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	commitSemanticChecks,
	prepareSemanticChecks,
} from "../../src/checkers/semantic.js";
import type {
	CheckerContext,
	Config,
	SemanticCheckResponse,
} from "../../src/checkers/types.js";
import { parseContextFile } from "../../src/parsers/context-file.js";

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
	ai: { enabled: true },
};

function makeContext(fixtureName: string): CheckerContext {
	const repoRoot = join(FIXTURES, fixtureName);
	const claims = parseContextFile(join(repoRoot, "CLAUDE.md"), "CLAUDE.md");
	return {
		repoRoot,
		claims,
		manifests: new Map(),
		staleness: new Map(),
		config: defaultConfig,
	};
}

describe("prepareSemanticChecks", () => {
	it("returns requests with correct structure", () => {
		const ctx = makeContext("node-project");
		const requests = prepareSemanticChecks(ctx);

		expect(requests.length).toBeGreaterThan(0);

		for (const req of requests) {
			expect(req.id).toMatch(/^CLAUDE\.md:batch-\d+$/);
			expect(req.file).toBe("CLAUDE.md");
			expect(req.messages).toHaveLength(2);
			expect(req.messages[0].role).toBe("system");
			expect(req.messages[1].role).toBe("user");
			expect(req.metadata.headings.length).toBeGreaterThan(0);
			expect(req.metadata.startLine).toBeGreaterThanOrEqual(1);
			expect(req.metadata.endLine).toBeGreaterThan(req.metadata.startLine);
		}
	});

	it("includes baseline context in user prompt", () => {
		const ctx = makeContext("node-project");
		const requests = prepareSemanticChecks(ctx);

		const userPrompt = requests[0].messages[1].content;
		expect(userPrompt).toContain("Repository baseline");
		expect(userPrompt).toContain("package.json");
	});

	it("includes section content in user prompt", () => {
		const ctx = makeContext("node-project");
		const requests = prepareSemanticChecks(ctx);

		const userPrompt = requests[0].messages[1].content;
		expect(userPrompt).toContain("Sections from");
		expect(userPrompt).toContain("CLAUDE.md");
	});

	it("returns empty array when no context files exist", () => {
		const ctx: CheckerContext = {
			repoRoot: join(FIXTURES, "node-project"),
			claims: [],
			manifests: new Map(),
			staleness: new Map(),
			config: defaultConfig,
		};
		const requests = prepareSemanticChecks(ctx);
		expect(requests).toEqual([]);
	});
});

describe("commitSemanticChecks", () => {
	it("parses valid LLM response into CheckResults", () => {
		const responses: SemanticCheckResponse[] = [
			{
				id: "CLAUDE.md:batch-0",
				content: JSON.stringify([
					{
						line: 3,
						claim: "Uses Express 4",
						reality:
							"package.json shows express@5.0.0, not Express 4",
						severity: "error",
					},
				]),
			},
		];

		const results = commitSemanticChecks(responses);

		expect(results).toHaveLength(1);
		expect(results[0].checker).toBe("semantic");
		expect(results[0].code).toBe("SEMANTIC_DRIFT");
		expect(results[0].severity).toBe("error");
		expect(results[0].file).toBe("CLAUDE.md");
		expect(results[0].line).toBe(3);
		expect(results[0].claimed).toBe("Uses Express 4");
		expect(results[0].actual).toContain("express@5.0.0");
	});

	it("returns empty array for empty JSON response", () => {
		const responses: SemanticCheckResponse[] = [
			{ id: "CLAUDE.md:batch-0", content: "[]" },
		];

		const results = commitSemanticChecks(responses);
		expect(results).toEqual([]);
	});

	it("returns empty array for unparseable response", () => {
		const responses: SemanticCheckResponse[] = [
			{ id: "CLAUDE.md:batch-0", content: "This is not JSON at all" },
		];

		const results = commitSemanticChecks(responses);
		expect(results).toEqual([]);
	});

	it("filters out hedging responses", () => {
		const responses: SemanticCheckResponse[] = [
			{
				id: "CLAUDE.md:batch-0",
				content: JSON.stringify([
					{
						line: 5,
						claim: "Uses Redis",
						reality: "This might be outdated, could potentially be wrong",
						severity: "warning",
					},
				]),
			},
		];

		const results = commitSemanticChecks(responses);
		expect(results).toEqual([]);
	});

	it("filters out self-confirming responses", () => {
		const responses: SemanticCheckResponse[] = [
			{
				id: "CLAUDE.md:batch-0",
				content: JSON.stringify([
					{
						line: 5,
						claim: "Uses TypeScript",
						reality: "This aligns with the claim, package.json confirms TypeScript",
						severity: "warning",
					},
				]),
			},
		];

		const results = commitSemanticChecks(responses);
		expect(results).toEqual([]);
	});

	it("handles multiple responses across batches", () => {
		const responses: SemanticCheckResponse[] = [
			{
				id: "CLAUDE.md:batch-0",
				content: JSON.stringify([
					{
						line: 3,
						claim: "Uses Express 4",
						reality: "package.json shows express@5.0.0",
						severity: "error",
					},
				]),
			},
			{
				id: "CLAUDE.md:batch-1",
				content: JSON.stringify([
					{
						line: 10,
						claim: "Uses PostgreSQL",
						reality: "No postgres dependency in package.json",
						severity: "warning",
					},
				]),
			},
		];

		const results = commitSemanticChecks(responses);
		expect(results).toHaveLength(2);
		expect(results[0].line).toBe(3);
		expect(results[1].line).toBe(10);
	});

	it("extracts file name correctly from request id", () => {
		const responses: SemanticCheckResponse[] = [
			{
				id: "docs/AGENTS.md:batch-2",
				content: JSON.stringify([
					{
						line: 1,
						claim: "foo",
						reality: "bar is the actual value in config.ts",
						severity: "error",
					},
				]),
			},
		];

		const results = commitSemanticChecks(responses);
		expect(results[0].file).toBe("docs/AGENTS.md");
	});
});

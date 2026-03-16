import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { parseContextFile } from "../../src/parsers/context-file.js";

const FIXTURES = join(import.meta.dirname, "../fixtures");

describe("parseContextFile", () => {
	it("extracts dependency claims from node project", () => {
		const claims = parseContextFile(
			join(FIXTURES, "node-project/CLAUDE.md"),
			"CLAUDE.md",
		);
		const depClaims = claims.filter((c) => c.type === "dependency");

		expect(depClaims.some((c) => c.value === "express")).toBe(true);
		expect(depClaims.some((c) => c.value === "react")).toBe(true);
		expect(depClaims.some((c) => c.value === "vitest")).toBe(true);
	});

	it("extracts versioned dependency claims", () => {
		const claims = parseContextFile(
			join(FIXTURES, "node-project/CLAUDE.md"),
			"CLAUDE.md",
		);
		const express = claims.find((c) => c.value === "express" && c.version);
		expect(express).toBeDefined();
		expect(express?.version).toBe("4");

		const react = claims.find((c) => c.value === "react" && c.version);
		expect(react).toBeDefined();
		expect(react?.version).toBe("18");
	});

	it("extracts path claims", () => {
		const claims = parseContextFile(
			join(FIXTURES, "node-project/CLAUDE.md"),
			"CLAUDE.md",
		);
		const pathClaims = claims.filter((c) => c.type === "path");

		expect(pathClaims.some((c) => c.value === "src/components")).toBe(true);
		expect(pathClaims.some((c) => c.value === "src/services")).toBe(true);
		expect(pathClaims.some((c) => c.value === "src/utils/helpers.ts")).toBe(true);
		expect(pathClaims.some((c) => c.value === "src/nonexistent")).toBe(true);
	});

	it("extracts command claims from code blocks", () => {
		const claims = parseContextFile(
			join(FIXTURES, "node-project/CLAUDE.md"),
			"CLAUDE.md",
		);
		const cmdClaims = claims.filter((c) => c.type === "command");

		expect(cmdClaims.some((c) => c.value === "npm run test:e2e")).toBe(true);
		expect(cmdClaims.some((c) => c.value === "npm run build")).toBe(true);
	});

	it("extracts command claims from inline code", () => {
		const claims = parseContextFile(
			join(FIXTURES, "node-project/CLAUDE.md"),
			"CLAUDE.md",
		);
		const cmdClaims = claims.filter((c) => c.type === "command");

		expect(cmdClaims.some((c) => c.value === "npm run lint")).toBe(true);
		expect(cmdClaims.some((c) => c.value === "pnpm format")).toBe(true);
	});

	it("does not produce duplicate claims for same value and line", () => {
		const claims = parseContextFile(
			join(FIXTURES, "node-project/CLAUDE.md"),
			"CLAUDE.md",
		);
		const keys = claims.map((c) => `${c.type}:${c.value}:${c.line}`);
		const uniqueKeys = new Set(keys);
		expect(keys.length).toBe(uniqueKeys.size);
	});
});

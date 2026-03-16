import { readFileSync } from "node:fs";
import { unified } from "unified";
import remarkParse from "remark-parse";
import type { Root, Code, InlineCode, Text, ListItem } from "mdast";
import type { Claim } from "../checkers/types.js";

const KNOWN_PACKAGES: Record<string, string> = {
	react: "react",
	"react-dom": "react-dom",
	"next.js": "next",
	nextjs: "next",
	next: "next",
	vue: "vue",
	angular: "angular",
	svelte: "svelte",
	express: "express",
	fastify: "fastify",
	hono: "hono",
	koa: "koa",
	nest: "@nestjs/core",
	nestjs: "@nestjs/core",
	typescript: "typescript",
	tailwind: "tailwindcss",
	tailwindcss: "tailwindcss",
	prisma: "prisma",
	drizzle: "drizzle-orm",
	sequelize: "sequelize",
	mongoose: "mongoose",
	jest: "jest",
	vitest: "vitest",
	mocha: "mocha",
	webpack: "webpack",
	vite: "vite",
	rollup: "rollup",
	esbuild: "esbuild",
	tsup: "tsup",
	eslint: "eslint",
	biome: "@biomejs/biome",
	prettier: "prettier",
	redux: "redux",
	zustand: "zustand",
	axios: "axios",
	zod: "zod",
	trpc: "@trpc/server",
	graphql: "graphql",
	apollo: "@apollo/server",
	django: "django",
	flask: "flask",
	fastapi: "fastapi",
	sqlalchemy: "sqlalchemy",
	numpy: "numpy",
	pandas: "pandas",
	pytorch: "torch",
	tensorflow: "tensorflow",
	gin: "github.com/gin-gonic/gin",
	echo: "github.com/labstack/echo",
	actix: "actix-web",
	tokio: "tokio",
	serde: "serde",
};

const COMMAND_RUNNERS = [
	"npm",
	"yarn",
	"pnpm",
	"npx",
	"make",
	"cargo",
	"go",
	"python",
	"python3",
	"pip",
	"pip3",
	"poetry",
	"bundle",
	"rake",
	"mix",
	"deno",
	"bun",
];

const PATH_PATTERN = /(?:^|\s|`)([a-zA-Z0-9_.][a-zA-Z0-9_.\-/]*\/[a-zA-Z0-9_.\-/]*)`?/g;
const DEP_VERSION_PATTERN = /\b([a-zA-Z][\w.-]*?)(?:@|[ ])(v?\d+(?:\.\d+)*(?:\.\d+)?)\b/g;
const DEP_NAME_PATTERN = new RegExp(
	`\\b(${Object.keys(KNOWN_PACKAGES).join("|")})\\b`,
	"gi",
);

export function parseContextFile(filePath: string, fileName: string): Claim[] {
	const content = readFileSync(filePath, "utf-8");
	const tree = unified().use(remarkParse).parse(content);
	const lines = content.split("\n");
	const claims: Claim[] = [];

	walkTree(tree, fileName, lines, claims);
	return deduplicateClaims(claims);
}

function walkTree(node: Root, fileName: string, lines: string[], claims: Claim[]): void {
	visitNodes(node, fileName, lines, claims);
}

function visitNodes(
	node: Root | import("mdast").RootContent,
	fileName: string,
	lines: string[],
	claims: Claim[],
): void {
	if (node.type === "code") {
		const codeNode = node as Code;
		const line = codeNode.position?.start.line ?? 0;
		const lang = codeNode.lang?.toLowerCase() ?? "";

		if (["bash", "sh", "shell", "zsh", "console", "terminal"].includes(lang)) {
			extractCommandsFromCodeBlock(codeNode.value, line, fileName, claims);
		}

		extractPathsFromText(codeNode.value, line, fileName, claims);
		extractDepsFromText(codeNode.value, line, fileName, claims);
	} else if (node.type === "inlineCode") {
		const inlineNode = node as InlineCode;
		const line = inlineNode.position?.start.line ?? 0;
		const text = inlineNode.value;

		extractCommandFromInline(text, line, fileName, claims);
		extractPathFromInline(text, line, fileName, claims);
		extractDepsFromText(text, line, fileName, claims);
	} else if (node.type === "text") {
		const textNode = node as Text;
		const line = textNode.position?.start.line ?? 0;
		extractDepsFromText(textNode.value, line, fileName, claims);
	} else if (node.type === "listItem") {
		const listItem = node as ListItem;
		const line = listItem.position?.start.line ?? 0;
		const text = extractTextFromNode(listItem);
		extractDepsFromText(text, line, fileName, claims);
	}

	if ("children" in node && Array.isArray(node.children)) {
		for (const child of node.children) {
			visitNodes(child as import("mdast").RootContent, fileName, lines, claims);
		}
	}
}

function extractTextFromNode(node: import("mdast").RootContent): string {
	const parts: string[] = [];
	if ("value" in node && typeof node.value === "string") {
		parts.push(node.value);
	}
	if ("children" in node && Array.isArray(node.children)) {
		for (const child of node.children) {
			parts.push(extractTextFromNode(child as import("mdast").RootContent));
		}
	}
	return parts.join(" ");
}

function extractCommandsFromCodeBlock(
	code: string,
	startLine: number,
	fileName: string,
	claims: Claim[],
): void {
	const codeLines = code.split("\n");
	for (let i = 0; i < codeLines.length; i++) {
		let line = codeLines[i].trim();
		if (line.startsWith("$") || line.startsWith(">")) {
			line = line.slice(1).trim();
		}
		if (!line) continue;

		const firstWord = line.split(/\s+/)[0];
		if (COMMAND_RUNNERS.includes(firstWord)) {
			claims.push({
				type: "command",
				raw: codeLines[i].trim(),
				value: line,
				line: startLine + i + 1,
				file: fileName,
			});
		}
	}
}

function extractCommandFromInline(
	text: string,
	line: number,
	fileName: string,
	claims: Claim[],
): void {
	const trimmed = text.trim();
	const firstWord = trimmed.split(/\s+/)[0];
	if (COMMAND_RUNNERS.includes(firstWord)) {
		claims.push({
			type: "command",
			raw: text,
			value: trimmed,
			line,
			file: fileName,
		});
	}
}

function extractPathFromInline(
	text: string,
	line: number,
	fileName: string,
	claims: Claim[],
): void {
	const trimmed = text.trim();
	if (trimmed.includes("/") && !trimmed.includes(" ") && /^[a-zA-Z0-9_.\-/]+$/.test(trimmed)) {
		const firstWord = trimmed.split(/\s+/)[0];
		if (COMMAND_RUNNERS.includes(firstWord)) return;
		if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return;

		claims.push({
			type: "path",
			raw: text,
			value: trimmed.replace(/\/+$/, ""),
			line,
			file: fileName,
		});
	}
}

function extractPathsFromText(
	text: string,
	startLine: number,
	fileName: string,
	claims: Claim[],
): void {
	const regex = new RegExp(PATH_PATTERN.source, "g");
	let match: RegExpExecArray | null;
	while ((match = regex.exec(text)) !== null) {
		const path = match[1].replace(/\/+$/, "");
		if (path.startsWith("http://") || path.startsWith("https://")) continue;
		if (path.length < 3) continue;
		// Skip things that look like version ranges or URLs
		if (/^\d/.test(path) && !path.includes("/src/")) continue;

		claims.push({
			type: "path",
			raw: match[0].trim(),
			value: path,
			line: startLine,
			file: fileName,
		});
	}
}

function extractDepsFromText(
	text: string,
	line: number,
	fileName: string,
	claims: Claim[],
): void {
	// Match versioned deps like "express@4", "React 18.2"
	const versionRegex = new RegExp(DEP_VERSION_PATTERN.source, "g");
	let match: RegExpExecArray | null;
	while ((match = versionRegex.exec(text)) !== null) {
		const name = match[1].toLowerCase();
		const version = match[2].replace(/^v/, "");
		const packageName = KNOWN_PACKAGES[name] || name;
		claims.push({
			type: "dependency",
			raw: match[0],
			value: packageName,
			version,
			line,
			file: fileName,
		});
	}

	// Match unversioned known package names
	const nameRegex = new RegExp(DEP_NAME_PATTERN.source, "gi");
	while ((match = nameRegex.exec(text)) !== null) {
		const name = match[1].toLowerCase();
		const packageName = KNOWN_PACKAGES[name] || name;
		// Only add if not already captured with a version
		if (!claims.some((c) => c.type === "dependency" && c.value === packageName && c.line === line)) {
			claims.push({
				type: "dependency",
				raw: match[0],
				value: packageName,
				line,
				file: fileName,
			});
		}
	}
}

function deduplicateClaims(claims: Claim[]): Claim[] {
	const seen = new Set<string>();
	return claims.filter((c) => {
		const key = `${c.type}:${c.value}:${c.line}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

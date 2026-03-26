import { resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { commitSemanticChecks } from "./checkers/semantic.js";
import { scan, scanPrepare } from "./scanner.js";

const server = new McpServer({
	name: "context-drift",
	version: "0.2.2",
});

server.tool(
	"prepare",
	"Gather repo context and build LLM prompts for semantic drift checks. Returns an array of requests, each containing messages ready to send to an LLM.",
	{ path: z.string().optional().describe("Path to repo root (default: cwd)") },
	async ({ path }) => {
		const repoRoot = resolve(path || ".");
		const requests = scanPrepare(repoRoot);
		return {
			content: [
				{
					type: "text" as const,
					text: JSON.stringify(requests, null, 2),
				},
			],
		};
	},
);

server.tool(
	"commit",
	"Process LLM responses into structured check results. Pass the responses array where each item has an 'id' (matching the request id) and 'content' (the raw LLM response text).",
	{
		responses: z.array(
			z.object({
				id: z.string().describe("The request id from prepare"),
				content: z.string().describe("Raw LLM response text"),
			}),
		),
	},
	async ({ responses }) => {
		const results = commitSemanticChecks(responses);
		return {
			content: [
				{
					type: "text" as const,
					text: JSON.stringify(results, null, 2),
				},
			],
		};
	},
);

server.tool(
	"check",
	"Check a repo for context drift. Runs deterministic checks immediately and returns semantic check prompts for you to process. Send each request's messages to your LLM, then call the 'commit' tool with the responses to get the full results.",
	{ path: z.string().optional().describe("Path to repo root (default: cwd)") },
	async ({ path }) => {
		const repoRoot = resolve(path || ".");

		// Run deterministic scan
		const scanResult = await scan(repoRoot);
		const deterministicIssues = scanResult.results.flatMap((f) => f.issues);

		// Build semantic check prompts
		const requests = scanPrepare(repoRoot);

		const parts: { type: "text"; text: string }[] = [];

		// Part 1: Deterministic results
		if (deterministicIssues.length > 0) {
			parts.push({
				type: "text" as const,
				text: `## Deterministic check results (${deterministicIssues.length} issues found)\n\n${JSON.stringify(deterministicIssues, null, 2)}`,
			});
		} else {
			parts.push({
				type: "text" as const,
				text: "## Deterministic check results\n\nNo issues found.",
			});
		}

		parts.push({
			type: "text" as const,
			text: `## Drift score: ${scanResult.score}/100`,
		});

		// Part 2: Semantic check prompts
		if (requests.length > 0) {
			parts.push({
				type: "text" as const,
				text: `## Semantic checks (${requests.length} prompt${requests.length > 1 ? "s" : ""} to process)\n\nTo complete the semantic analysis, process each request below by sending its "messages" array to your LLM. Then call the "commit" tool with an array of responses, where each response has the matching "id" and the LLM's response as "content".\n\n${JSON.stringify(requests, null, 2)}`,
			});
		} else {
			parts.push({
				type: "text" as const,
				text: "## Semantic checks\n\nNo context files with checkable sections found.",
			});
		}

		return { content: parts };
	},
);

async function main() {
	const transport = new StdioServerTransport();
	await server.connect(transport);
}

main().catch((err) => {
	console.error("MCP server error:", err);
	process.exit(1);
});

import { resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { commitSemanticChecks } from "./checkers/semantic.js";
import { scanPrepare } from "./scanner.js";

const server = new McpServer({
	name: "context-drift",
	version: "0.1.3",
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

async function main() {
	const transport = new StdioServerTransport();
	await server.connect(transport);
}

main().catch((err) => {
	console.error("MCP server error:", err);
	process.exit(1);
});

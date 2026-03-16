import https from "node:https";
import http from "node:http";
import { URL } from "node:url";

export interface AIProvider {
	name: string;
	chat(messages: { role: string; content: string }[], model?: string): Promise<string>;
}

interface AnthropicResponse {
	content: { type: string; text: string }[];
}

interface OpenAIResponse {
	choices: { message: { content: string } }[];
}

interface OllamaResponse {
	message: { content: string };
}

function httpPost(url: string, headers: Record<string, string>, body: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const parsed = new URL(url);
		const isHttps = parsed.protocol === "https:";
		const lib = isHttps ? https : http;

		const req = lib.request(
			{
				hostname: parsed.hostname,
				port: parsed.port || (isHttps ? 443 : 80),
				path: parsed.pathname + parsed.search,
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Content-Length": Buffer.byteLength(body),
					...headers,
				},
			},
			(res) => {
				const chunks: Buffer[] = [];
				res.on("data", (chunk: Buffer) => chunks.push(chunk));
				res.on("end", () => {
					const responseBody = Buffer.concat(chunks).toString();
					if (res.statusCode && res.statusCode >= 400) {
						reject(new Error(`HTTP ${res.statusCode}: ${responseBody}`));
					} else {
						resolve(responseBody);
					}
				});
			},
		);
		req.on("error", reject);
		req.write(body);
		req.end();
	});
}

function createAnthropicProvider(apiKey: string): AIProvider {
	return {
		name: "anthropic",
		async chat(messages, model = "claude-haiku-4-5-20251001") {
			const systemMsg = messages.find((m) => m.role === "system");
			const userMessages = messages.filter((m) => m.role !== "system");

			const body = JSON.stringify({
				model,
				max_tokens: 2048,
				system: systemMsg?.content ?? "",
				messages: userMessages.map((m) => ({ role: m.role, content: m.content })),
			});

			const response = await httpPost(
				"https://api.anthropic.com/v1/messages",
				{
					"x-api-key": apiKey,
					"anthropic-version": "2023-06-01",
				},
				body,
			);

			const parsed: AnthropicResponse = JSON.parse(response);
			const textBlock = parsed.content.find((b) => b.type === "text");
			return textBlock?.text ?? "";
		},
	};
}

function createOpenAIProvider(apiKey: string): AIProvider {
	return {
		name: "openai",
		async chat(messages, model = "gpt-4o-mini") {
			const body = JSON.stringify({
				model,
				messages: messages.map((m) => ({ role: m.role, content: m.content })),
				max_tokens: 2048,
			});

			const response = await httpPost(
				"https://api.openai.com/v1/chat/completions",
				{ Authorization: `Bearer ${apiKey}` },
				body,
			);

			const parsed: OpenAIResponse = JSON.parse(response);
			return parsed.choices[0]?.message?.content ?? "";
		},
	};
}

function createOllamaProvider(baseUrl = "http://localhost:11434"): AIProvider {
	return {
		name: "ollama",
		async chat(messages, model = "llama3.1") {
			const body = JSON.stringify({
				model,
				messages: messages.map((m) => ({ role: m.role, content: m.content })),
				stream: false,
			});

			const response = await httpPost(
				`${baseUrl}/api/chat`,
				{},
				body,
			);

			const parsed: OllamaResponse = JSON.parse(response);
			return parsed.message?.content ?? "";
		},
	};
}

export interface AIOptions {
	provider?: string;
	model?: string;
}

export function resolveProvider(options: AIOptions = {}): AIProvider {
	const explicit = options.provider;

	if (explicit === "anthropic" || (!explicit && process.env.ANTHROPIC_API_KEY)) {
		const key = process.env.ANTHROPIC_API_KEY;
		if (!key) throw new Error("ANTHROPIC_API_KEY environment variable is required for Anthropic provider");
		return createAnthropicProvider(key);
	}

	if (explicit === "openai" || (!explicit && process.env.OPENAI_API_KEY)) {
		const key = process.env.OPENAI_API_KEY;
		if (!key) throw new Error("OPENAI_API_KEY environment variable is required for OpenAI provider");
		return createOpenAIProvider(key);
	}

	if (explicit === "ollama" || !explicit) {
		const baseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
		return createOllamaProvider(baseUrl);
	}

	throw new Error(`Unknown AI provider: "${explicit}". Supported: anthropic, openai, ollama`);
}

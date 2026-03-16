import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface PythonManifest {
	type: "python";
	dependencies: Map<string, string>;
}

export function parsePythonManifests(repoRoot: string): PythonManifest | null {
	const deps = new Map<string, string>();

	// requirements.txt
	const reqPath = join(repoRoot, "requirements.txt");
	if (existsSync(reqPath)) {
		const content = readFileSync(reqPath, "utf-8");
		for (const line of content.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("-")) continue;
			const match = trimmed.match(/^([a-zA-Z0-9_.-]+)\s*(?:[><=!~]+\s*(.+))?/);
			if (match) {
				deps.set(match[1].toLowerCase(), match[2]?.trim() ?? "*");
			}
		}
	}

	// pyproject.toml (basic parsing for [project] dependencies)
	const pyprojectPath = join(repoRoot, "pyproject.toml");
	if (existsSync(pyprojectPath)) {
		const content = readFileSync(pyprojectPath, "utf-8");
		const depsMatch = content.match(/\[project\][\s\S]*?dependencies\s*=\s*\[([\s\S]*?)\]/);
		if (depsMatch) {
			const depsBlock = depsMatch[1];
			for (const line of depsBlock.split("\n")) {
				const trimmed = line.trim().replace(/^["']|["'],?$/g, "");
				if (!trimmed) continue;
				const match = trimmed.match(/^([a-zA-Z0-9_.-]+)\s*(?:[><=!~]+\s*(.+))?/);
				if (match) {
					deps.set(match[1].toLowerCase(), match[2]?.trim() ?? "*");
				}
			}
		}
	}

	// Pipfile
	const pipfilePath = join(repoRoot, "Pipfile");
	if (existsSync(pipfilePath)) {
		const content = readFileSync(pipfilePath, "utf-8");
		const sections = content.match(/\[packages\]([\s\S]*?)(?:\[|$)/);
		if (sections) {
			for (const line of sections[1].split("\n")) {
				const match = line.trim().match(/^([a-zA-Z0-9_.-]+)\s*=/);
				if (match) {
					deps.set(match[1].toLowerCase(), "*");
				}
			}
		}
	}

	if (deps.size === 0) return null;
	return { type: "python", dependencies: deps };
}

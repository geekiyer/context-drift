import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface CargoManifest {
	type: "cargo";
	dependencies: Map<string, string>;
}

export function parseCargoToml(repoRoot: string): CargoManifest | null {
	const filePath = join(repoRoot, "Cargo.toml");
	if (!existsSync(filePath)) return null;

	const content = readFileSync(filePath, "utf-8");
	const deps = new Map<string, string>();

	// Match [dependencies] and [dev-dependencies] sections
	const sections = content.matchAll(/\[((?:dev-)?dependencies)\]\s*\n([\s\S]*?)(?=\n\[|$)/g);
	for (const section of sections) {
		const block = section[2];
		for (const line of block.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;

			// name = "version"
			const simpleMatch = trimmed.match(/^([a-zA-Z0-9_-]+)\s*=\s*"([^"]+)"/);
			if (simpleMatch) {
				deps.set(simpleMatch[1], simpleMatch[2]);
				continue;
			}

			// name = { version = "..." }
			const tableMatch = trimmed.match(
				/^([a-zA-Z0-9_-]+)\s*=\s*\{.*version\s*=\s*"([^"]+)"/,
			);
			if (tableMatch) {
				deps.set(tableMatch[1], tableMatch[2]);
			}
		}
	}

	if (deps.size === 0) return null;
	return { type: "cargo", dependencies: deps };
}

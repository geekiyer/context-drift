import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface GoManifest {
	type: "go";
	dependencies: Map<string, string>;
}

export function parseGoMod(repoRoot: string): GoManifest | null {
	const filePath = join(repoRoot, "go.mod");
	if (!existsSync(filePath)) return null;

	const content = readFileSync(filePath, "utf-8");
	const deps = new Map<string, string>();

	// Match require blocks
	const requireBlock = content.match(/require\s*\(([\s\S]*?)\)/g);
	if (requireBlock) {
		for (const block of requireBlock) {
			const inner = block.replace(/require\s*\(/, "").replace(/\)/, "");
			for (const line of inner.split("\n")) {
				const match = line.trim().match(/^(\S+)\s+(v[\d.]+\S*)/);
				if (match) {
					deps.set(match[1], match[2]);
				}
			}
		}
	}

	// Match single-line requires
	const singleRequire = content.matchAll(/require\s+(\S+)\s+(v[\d.]+\S*)/g);
	for (const match of singleRequire) {
		deps.set(match[1], match[2]);
	}

	if (deps.size === 0) return null;
	return { type: "go", dependencies: deps };
}

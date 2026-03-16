import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface PackageJsonManifest {
	type: "package-json";
	dependencies: Map<string, string>;
	scripts: Map<string, string>;
}

export function parsePackageJson(repoRoot: string): PackageJsonManifest | null {
	const filePath = join(repoRoot, "package.json");
	if (!existsSync(filePath)) return null;

	const raw = JSON.parse(readFileSync(filePath, "utf-8"));
	const deps = new Map<string, string>();
	const scripts = new Map<string, string>();

	for (const section of [
		"dependencies",
		"devDependencies",
		"peerDependencies",
	]) {
		if (raw[section] && typeof raw[section] === "object") {
			for (const [name, version] of Object.entries(raw[section])) {
				deps.set(name, String(version));
			}
		}
	}

	if (raw.scripts && typeof raw.scripts === "object") {
		for (const [name, cmd] of Object.entries(raw.scripts)) {
			scripts.set(name, String(cmd));
		}
	}

	return { type: "package-json", dependencies: deps, scripts };
}

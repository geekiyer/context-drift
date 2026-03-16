import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CheckResult, CheckerContext } from "./types.js";
import type { PackageJsonManifest } from "../parsers/package-json.js";

export function checkCommands(context: CheckerContext): CheckResult[] {
	const results: CheckResult[] = [];
	const commandClaims = context.claims.filter((c) => c.type === "command");
	const pkgManifest = context.manifests.get("package-json") as PackageJsonManifest | undefined;
	const makeTargets = parseMakefileTargets(context.repoRoot);

	for (const claim of commandClaims) {
		const cmd = claim.value;

		// npm/yarn/pnpm run <script>
		const npmRunMatch = cmd.match(/^(?:npm|yarn|pnpm)\s+run\s+(\S+)/);
		if (npmRunMatch) {
			const scriptName = npmRunMatch[1];
			if (pkgManifest && !pkgManifest.scripts.has(scriptName)) {
				results.push({
					checker: "command",
					code: "DEAD_COMMAND",
					severity: "error",
					file: claim.file,
					line: claim.line,
					message: `"${cmd}" — script "${scriptName}" not found in package.json`,
					claimed: cmd,
				});
			}
			continue;
		}

		// npm/yarn/pnpm <built-in-or-script>
		const npmShortMatch = cmd.match(/^(?:npm|yarn|pnpm)\s+(\S+)/);
		if (npmShortMatch) {
			const subcmd = npmShortMatch[1];
			const builtins = [
				"install", "i", "ci", "add", "remove", "rm", "uninstall",
				"update", "up", "init", "publish", "pack", "link",
				"audit", "outdated", "ls", "list", "exec", "dlx",
				"create", "config", "set", "get", "cache", "rebuild",
				"prune", "dedupe", "why", "bin", "root", "prefix",
				"version", "view", "info", "search", "login", "logout",
				"whoami", "token", "team", "access", "owner", "deprecate",
				"star", "stars", "ping", "doctor", "explore", "fund",
				"org", "hook", "dist-tag", "shrinkwrap", "completion",
				"help", "start", "stop", "restart", "test", "t",
			];
			if (!builtins.includes(subcmd)) {
				// It might be a script shorthand (yarn/pnpm allow running scripts directly)
				if (pkgManifest && !pkgManifest.scripts.has(subcmd)) {
					results.push({
						checker: "command",
						code: "DEAD_COMMAND",
						severity: "error",
						file: claim.file,
						line: claim.line,
						message: `"${cmd}" — script "${subcmd}" not found in package.json`,
						claimed: cmd,
					});
				}
			}
			continue;
		}

		// make <target>
		const makeMatch = cmd.match(/^make\s+(\S+)/);
		if (makeMatch) {
			const target = makeMatch[1];
			if (makeTargets !== null && !makeTargets.has(target)) {
				results.push({
					checker: "command",
					code: "DEAD_COMMAND",
					severity: "error",
					file: claim.file,
					line: claim.line,
					message: `"${cmd}" — target "${target}" not found in Makefile`,
					claimed: cmd,
				});
			}
		}
	}

	return results;
}

function parseMakefileTargets(repoRoot: string): Set<string> | null {
	const makefilePath = join(repoRoot, "Makefile");
	if (!existsSync(makefilePath)) return null;

	const content = readFileSync(makefilePath, "utf-8");
	const targets = new Set<string>();

	for (const line of content.split("\n")) {
		const match = line.match(/^([a-zA-Z0-9_.-]+)\s*:/);
		if (match) {
			targets.add(match[1]);
		}
	}

	return targets;
}

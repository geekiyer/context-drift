import { existsSync } from "node:fs";
import { join } from "node:path";
import type { CheckerContext, CheckResult } from "./types.js";

export function checkPaths(context: CheckerContext): CheckResult[] {
	const results: CheckResult[] = [];
	const pathClaims = context.claims.filter((c) => c.type === "path");

	for (const claim of pathClaims) {
		const fullPath = join(context.repoRoot, claim.value);
		if (!existsSync(fullPath)) {
			results.push({
				checker: "path",
				code: "MISSING_PATH",
				severity: "warning",
				file: claim.file,
				line: claim.line,
				message: `References "${claim.value}" — path not found`,
				claimed: claim.value,
			});
		}
	}

	return results;
}

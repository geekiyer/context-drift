import type { CheckerContext, CheckResult } from "./types.js";

export function checkStaleness(context: CheckerContext): CheckResult[] {
	const results: CheckResult[] = [];
	const { config } = context;

	for (const [file, info] of context.staleness) {
		const { daysSince, commitsSince } = info;

		if (
			daysSince >= config.staleness.errorDays ||
			commitsSince >= config.staleness.errorCommits
		) {
			results.push({
				checker: "staleness",
				code: "STALE_FILE",
				severity: "error",
				file,
				message: `Last modified ${daysSince} days ago with ${commitsSince} commits since — exceeds error threshold`,
				claimed: `Updated within ${config.staleness.errorDays} days / ${config.staleness.errorCommits} commits`,
				actual: `${daysSince} days / ${commitsSince} commits`,
			});
		} else if (
			daysSince >= config.staleness.warnDays ||
			commitsSince >= config.staleness.warnCommits
		) {
			results.push({
				checker: "staleness",
				code: "STALE_FILE",
				severity: "warning",
				file,
				message: `Last modified ${daysSince} days ago with ${commitsSince} commits since — exceeds warning threshold`,
				claimed: `Updated within ${config.staleness.warnDays} days / ${config.staleness.warnCommits} commits`,
				actual: `${daysSince} days / ${commitsSince} commits`,
			});
		}
	}

	return results;
}

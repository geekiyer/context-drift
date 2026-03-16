import type { ScanResult } from "../checkers/types.js";

export function reportJson(result: ScanResult): string {
	const output = {
		version: result.version,
		files_scanned: result.filesScanned,
		results: result.results.map((r) => ({
			file: r.file,
			staleness: r.staleness
				? {
						last_modified: r.staleness.lastModified?.toISOString() ?? null,
						commits_since: r.staleness.commitsSince,
						days_since: r.staleness.daysSince,
					}
				: null,
			issues: r.issues.map((i) => ({
				checker: i.checker,
				severity: i.severity,
				code: i.code,
				line: i.line ?? null,
				message: i.message,
				claimed: i.claimed ?? null,
				actual: i.actual ?? null,
			})),
		})),
		summary: result.summary,
	};

	return JSON.stringify(output, null, 2);
}

import type { ScanResult } from "../checkers/types.js";

export function reportGitHubAnnotations(result: ScanResult): string {
	const lines: string[] = [];

	for (const fileResult of result.results) {
		for (const issue of fileResult.issues) {
			const level = issue.severity === "error" ? "error" : "warning";
			const line = issue.line ?? 1;
			lines.push(
				`::${level} file=${issue.file},line=${line}::${issue.code}: ${issue.message}`,
			);
		}
	}

	return lines.join("\n");
}

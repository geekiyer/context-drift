import chalk from "chalk";
import type { ScanResult, FileResult, CheckResult } from "../checkers/types.js";

export function reportConsole(result: ScanResult): string {
	const lines: string[] = [];

	lines.push(
		chalk.bold(`context-drift v${result.version}`) +
			` — ${result.filesScanned} file${result.filesScanned === 1 ? "" : "s"} scanned`,
	);
	lines.push("");

	if (result.filesScanned === 0) {
		lines.push(chalk.yellow("No context files found."));
		return lines.join("\n");
	}

	for (const fileResult of result.results) {
		lines.push(formatFileHeader(fileResult));

		if (fileResult.issues.length === 0) {
			lines.push(`  ${chalk.green("✓")}  No issues detected`);
		} else {
			for (const issue of fileResult.issues) {
				lines.push(formatIssue(issue));
			}
		}

		// Count verified claims (claims that didn't produce issues)
		lines.push("");
	}

	const { errors, warnings } = result.summary;
	const summaryParts: string[] = [];
	if (warnings > 0) summaryParts.push(chalk.yellow(`${warnings} warning${warnings === 1 ? "" : "s"}`));
	if (errors > 0) summaryParts.push(chalk.red(`${errors} error${errors === 1 ? "" : "s"}`));

	if (summaryParts.length === 0) {
		lines.push(chalk.green("No issues found."));
	} else {
		lines.push(
			`Summary: ${summaryParts.join(", ")} across ${result.filesScanned} file${result.filesScanned === 1 ? "" : "s"}`,
		);
	}

	return lines.join("\n");
}

function formatFileHeader(fileResult: FileResult): string {
	const parts = [chalk.bold.underline(fileResult.file)];
	if (fileResult.staleness?.daysSince) {
		parts.push(
			chalk.dim(
				`(last modified: ${fileResult.staleness.daysSince} days ago, ${fileResult.staleness.commitsSince} commits since)`,
			),
		);
	}
	return parts.join(" ");
}

function formatIssue(issue: CheckResult): string {
	const icon = issue.severity === "error" ? chalk.red("✗") : chalk.yellow("⚠");
	const code = chalk.dim(padRight(issue.code, 22));
	const lineRef = issue.line ? `Line ${issue.line}: ` : "";
	return `  ${icon}  ${code} ${lineRef}${issue.message}`;
}

function padRight(str: string, len: number): string {
	return str.length >= len ? str : str + " ".repeat(len - str.length);
}

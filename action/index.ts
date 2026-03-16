import { resolve } from "node:path";
import { reportConsole } from "../src/reporters/console.js";
import { reportGitHubAnnotations } from "../src/reporters/github-annotations.js";
import { scan } from "../src/scanner.js";

async function run() {
	const strict = process.env.INPUT_STRICT === "true";
	const path = process.env.INPUT_PATH || ".";
	const repoRoot = resolve(path);

	const result = await scan(repoRoot, strict ? { strict: true } : undefined);

	// Print console output for the log
	console.log(reportConsole(result));

	// Print GitHub annotations
	const annotations = reportGitHubAnnotations(result);
	if (annotations) {
		console.log(annotations);
	}

	if (result.summary.errors > 0) {
		process.exitCode = 1;
	}
	if (strict && result.summary.warnings > 0) {
		process.exitCode = 1;
	}
}

run().catch((err) => {
	console.error("Error:", err instanceof Error ? err.message : err);
	process.exitCode = 2;
});

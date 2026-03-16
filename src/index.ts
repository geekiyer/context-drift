export { scan } from "./scanner.js";
export { loadConfig, discoverContextFiles } from "./config.js";
export { parseContextFile } from "./parsers/context-file.js";
export { reportConsole } from "./reporters/console.js";
export { reportJson } from "./reporters/json.js";
export { reportGitHubAnnotations } from "./reporters/github-annotations.js";
export type {
	Claim,
	CheckResult,
	CheckerContext,
	Config,
	ScanResult,
	FileResult,
	StalenessInfo,
} from "./checkers/types.js";

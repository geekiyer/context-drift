import { join } from "node:path";
import simpleGit from "simple-git";
import { loadConfig, discoverContextFiles } from "./config.js";
import { parseContextFile } from "./parsers/context-file.js";
import { parsePackageJson } from "./parsers/package-json.js";
import { parsePythonManifests } from "./parsers/pyproject.js";
import { parseGoMod } from "./parsers/go-mod.js";
import { parseCargoToml } from "./parsers/cargo-toml.js";
import { checkStaleness } from "./checkers/staleness.js";
import { checkPaths } from "./checkers/path.js";
import { checkCommands } from "./checkers/command.js";
import { checkDependencies } from "./checkers/dependency.js";
import { checkCrossFile } from "./checkers/cross-file.js";
import type {
	Config,
	Claim,
	CheckResult,
	CheckerContext,
	StalenessInfo,
	FileResult,
	ScanResult,
} from "./checkers/types.js";

const VERSION = "0.1.0";

export async function scan(repoRoot: string, configOverrides?: Partial<Config>): Promise<ScanResult> {
	const config = { ...loadConfig(repoRoot), ...configOverrides };
	const contextFiles = discoverContextFiles(repoRoot, config);

	if (contextFiles.length === 0) {
		return {
			version: VERSION,
			filesScanned: 0,
			results: [],
			summary: { errors: 0, warnings: 0 },
		};
	}

	// Parse manifests
	const manifests = new Map<string, unknown>();
	const pkgJson = parsePackageJson(repoRoot);
	if (pkgJson) manifests.set("package-json", pkgJson);
	const python = parsePythonManifests(repoRoot);
	if (python) manifests.set("python", python);
	const goMod = parseGoMod(repoRoot);
	if (goMod) manifests.set("go", goMod);
	const cargo = parseCargoToml(repoRoot);
	if (cargo) manifests.set("cargo", cargo);

	// Parse claims from all context files
	const allClaims: Claim[] = [];
	for (const file of contextFiles) {
		const filePath = join(repoRoot, file);
		const claims = parseContextFile(filePath, file);
		allClaims.push(...claims);
	}

	// Get staleness info
	const stalenessMap = new Map<string, StalenessInfo>();
	for (const file of contextFiles) {
		const info = await getStalenessInfo(repoRoot, file);
		stalenessMap.set(file, info);
	}

	// Build checker context
	const checkerContext: CheckerContext = {
		repoRoot,
		claims: allClaims,
		manifests,
		staleness: stalenessMap,
		config,
	};

	// Run all checkers
	const allIssues: CheckResult[] = [
		...checkStaleness(checkerContext),
		...checkPaths(checkerContext),
		...checkCommands(checkerContext),
		...checkDependencies(checkerContext),
		...checkCrossFile(checkerContext),
	];

	// Filter ignored issues
	const filteredIssues = allIssues.filter((issue) => !isIgnored(issue, config.ignore));

	// Group results by file
	const fileResults: FileResult[] = contextFiles.map((file) => ({
		file,
		staleness: stalenessMap.get(file) ?? null,
		issues: filteredIssues.filter((i) => i.file === file),
	}));

	const summary = {
		errors: filteredIssues.filter((i) => i.severity === "error").length,
		warnings: filteredIssues.filter((i) => i.severity === "warning").length,
	};

	return {
		version: VERSION,
		filesScanned: contextFiles.length,
		results: fileResults,
		summary,
	};
}

async function getStalenessInfo(
	repoRoot: string,
	file: string,
): Promise<StalenessInfo> {
	try {
		const git = simpleGit(repoRoot);
		const isRepo = await git.checkIsRepo();
		if (!isRepo) {
			return { lastModified: null, commitsSince: 0, daysSince: 0 };
		}

		// Get last modification date of the file
		const log = await git.log({ file, maxCount: 1 });
		if (!log.latest) {
			return { lastModified: null, commitsSince: 0, daysSince: 0 };
		}

		const lastModified = new Date(log.latest.date);
		const daysSince = Math.floor(
			(Date.now() - lastModified.getTime()) / (1000 * 60 * 60 * 24),
		);

		// Count commits since the file was last modified
		const allLogs = await git.log({ from: log.latest.hash, to: "HEAD" });
		const commitsSince = allLogs.total;

		return { lastModified, commitsSince, daysSince };
	} catch {
		return { lastModified: null, commitsSince: 0, daysSince: 0 };
	}
}

function isIgnored(
	issue: CheckResult,
	ignoreRules: Config["ignore"],
): boolean {
	return ignoreRules.some((rule) => {
		if (rule.code !== issue.code) return false;
		if (rule.file && rule.file !== issue.file) return false;
		if (rule.line != null && rule.line !== issue.line) return false;
		if (rule.pattern && issue.claimed) {
			const regex = new RegExp(
				rule.pattern.replace(/\*/g, ".*").replace(/\?/g, "."),
			);
			if (!regex.test(issue.claimed)) return false;
		}
		return true;
	});
}

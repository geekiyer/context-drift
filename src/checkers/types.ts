export interface Claim {
	type: "dependency" | "path" | "command" | "stack";
	raw: string;
	value: string;
	version?: string;
	line: number;
	file: string;
}

export interface CheckResult {
	checker: string;
	code: string;
	severity: "error" | "warning" | "info";
	file: string;
	line?: number;
	message: string;
	claimed?: string;
	actual?: string;
}

export interface StalenessInfo {
	lastModified: Date | null;
	commitsSince: number;
	daysSince: number;
}

export interface CheckerContext {
	repoRoot: string;
	claims: Claim[];
	manifests: Map<string, unknown>;
	staleness: Map<string, StalenessInfo>;
	config: Config;
}

export interface AIConfig {
	enabled: boolean;
	provider?: string;
	model?: string;
}

export interface Config {
	files: string[];
	staleness: {
		warnDays: number;
		warnCommits: number;
		errorDays: number;
		errorCommits: number;
	};
	ignore: IgnoreRule[];
	strict: boolean;
	ai: AIConfig;
}

export interface IgnoreRule {
	code: string;
	file?: string;
	line?: number;
	pattern?: string;
}

export interface FileResult {
	file: string;
	staleness: StalenessInfo | null;
	issues: CheckResult[];
}

export interface ScanResult {
	version: string;
	filesScanned: number;
	results: FileResult[];
	summary: { errors: number; warnings: number };
	score: number;
}

export type Checker = (context: CheckerContext) => CheckResult[];

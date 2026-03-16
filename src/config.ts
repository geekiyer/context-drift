import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { Config } from "./checkers/types.js";

const DEFAULT_CONTEXT_FILES = [
	"CLAUDE.md",
	"AGENTS.md",
	".cursorrules",
	".github/copilot-instructions.md",
	".windsurfrules",
	"GEMINI.md",
];

const DEFAULT_CONFIG: Config = {
	files: [],
	staleness: {
		warnDays: 30,
		warnCommits: 50,
		errorDays: 90,
		errorCommits: 200,
	},
	ignore: [],
	strict: false,
	ai: { enabled: false },
};

export function loadConfig(repoRoot: string): Config {
	const configPath = join(repoRoot, ".context-drift.yml");
	const config: Config = {
		...DEFAULT_CONFIG,
		staleness: { ...DEFAULT_CONFIG.staleness },
		ignore: [],
	};

	if (existsSync(configPath)) {
		const raw = readFileSync(configPath, "utf-8");
		const parsed = parseYaml(raw);
		if (parsed) {
			if (Array.isArray(parsed.files)) {
				config.files = parsed.files;
			}
			if (parsed.staleness) {
				const s = parsed.staleness;
				if (s.warn_days != null) config.staleness.warnDays = s.warn_days;
				if (s.warn_commits != null)
					config.staleness.warnCommits = s.warn_commits;
				if (s.error_days != null) config.staleness.errorDays = s.error_days;
				if (s.error_commits != null)
					config.staleness.errorCommits = s.error_commits;
			}
			if (Array.isArray(parsed.ignore)) {
				config.ignore = parsed.ignore.map((r: Record<string, unknown>) => ({
					code: r.code as string,
					file: r.file as string | undefined,
					line: r.line as number | undefined,
					pattern: r.pattern as string | undefined,
				}));
			}
			if (parsed.strict != null) {
				config.strict = Boolean(parsed.strict);
			}
		}
	}

	return config;
}

export function discoverContextFiles(
	repoRoot: string,
	config: Config,
): string[] {
	const candidates = [...DEFAULT_CONTEXT_FILES, ...config.files];
	return candidates.filter((f) => existsSync(join(repoRoot, f)));
}

export function generateDefaultConfig(): string {
	return `# context-drift configuration
# See: https://github.com/context-drift/context-drift

# Additional context files to scan beyond the defaults
# files:
#   - docs/AI_CONTEXT.md
#   - .claude/project-notes.md

# Override severity thresholds
staleness:
  warn_days: 30
  warn_commits: 50
  error_days: 90
  error_commits: 200

# Ignore specific checks
# ignore:
#   - code: STALE_DEPENDENCY
#     file: CLAUDE.md
#     line: 12
#   - code: MISSING_PATH
#     pattern: "docs/legacy/*"

# Treat warnings as errors
strict: false
`;
}

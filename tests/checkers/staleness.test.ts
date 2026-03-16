import { describe, expect, it } from "vitest";
import { checkStaleness } from "../../src/checkers/staleness.js";
import type {
	CheckerContext,
	Config,
	StalenessInfo,
} from "../../src/checkers/types.js";

const defaultConfig: Config = {
	files: [],
	staleness: {
		warnDays: 30,
		warnCommits: 50,
		errorDays: 90,
		errorCommits: 200,
	},
	ignore: [],
	strict: false,
};

describe("checkStaleness", () => {
	it("reports warning when exceeding warn threshold", () => {
		const staleness = new Map<string, StalenessInfo>();
		staleness.set("CLAUDE.md", {
			lastModified: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
			commitsSince: 60,
			daysSince: 45,
		});

		const ctx: CheckerContext = {
			repoRoot: "/tmp",
			claims: [],
			manifests: new Map(),
			staleness,
			config: defaultConfig,
		};

		const results = checkStaleness(ctx);
		expect(results).toHaveLength(1);
		expect(results[0].severity).toBe("warning");
		expect(results[0].code).toBe("STALE_FILE");
	});

	it("reports error when exceeding error threshold", () => {
		const staleness = new Map<string, StalenessInfo>();
		staleness.set("CLAUDE.md", {
			lastModified: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000),
			commitsSince: 250,
			daysSince: 100,
		});

		const ctx: CheckerContext = {
			repoRoot: "/tmp",
			claims: [],
			manifests: new Map(),
			staleness,
			config: defaultConfig,
		};

		const results = checkStaleness(ctx);
		expect(results).toHaveLength(1);
		expect(results[0].severity).toBe("error");
	});

	it("reports nothing when within thresholds", () => {
		const staleness = new Map<string, StalenessInfo>();
		staleness.set("CLAUDE.md", {
			lastModified: new Date(),
			commitsSince: 5,
			daysSince: 2,
		});

		const ctx: CheckerContext = {
			repoRoot: "/tmp",
			claims: [],
			manifests: new Map(),
			staleness,
			config: defaultConfig,
		};

		const results = checkStaleness(ctx);
		expect(results).toHaveLength(0);
	});
});

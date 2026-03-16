import type { Claim, CheckResult, CheckerContext } from "./types.js";

export function checkCrossFile(context: CheckerContext): CheckResult[] {
	const results: CheckResult[] = [];
	const { claims } = context;

	// Group claims by type
	const commandClaims = claims.filter((c) => c.type === "command");
	const depClaims = claims.filter((c) => c.type === "dependency");

	// Check for conflicting test commands across files
	results.push(...checkConflictingCommands(commandClaims, "test"));
	results.push(...checkConflictingCommands(commandClaims, "build"));
	results.push(...checkConflictingCommands(commandClaims, "lint"));

	// Check for conflicting dependency claims
	results.push(...checkConflictingDeps(depClaims));

	return results;
}

function checkConflictingCommands(
	claims: Claim[],
	keyword: string,
): CheckResult[] {
	const results: CheckResult[] = [];
	const relevantClaims = claims.filter((c) =>
		c.value.toLowerCase().includes(keyword),
	);

	// Only check across different files
	const byFile = groupByFile(relevantClaims);
	const files = [...byFile.keys()];

	for (let i = 0; i < files.length; i++) {
		for (let j = i + 1; j < files.length; j++) {
			const fileAClaims = byFile.get(files[i])!;
			const fileBClaims = byFile.get(files[j])!;

			const fileACommands = new Set(fileAClaims.map((c) => normalizeCommand(c.value)));
			const fileBCommands = new Set(fileBClaims.map((c) => normalizeCommand(c.value)));

			// Find commands in A not in B and vice versa
			for (const claimA of fileAClaims) {
				const normalizedA = normalizeCommand(claimA.value);
				for (const claimB of fileBClaims) {
					const normalizedB = normalizeCommand(claimB.value);
					if (
						normalizedA !== normalizedB &&
						!fileACommands.has(normalizedB) &&
						!fileBCommands.has(normalizedA)
					) {
						results.push({
							checker: "cross-file",
							code: "CROSS_FILE_CONFLICT",
							severity: "warning",
							file: claimA.file,
							line: claimA.line,
							message: `Line ${claimA.line} vs ${claimB.file}:${claimB.line} — different ${keyword} commands: "${claimA.value}" vs "${claimB.value}"`,
							claimed: claimA.value,
							actual: claimB.value,
						});
						// Only report once per pair
						return results;
					}
				}
			}
		}
	}

	return results;
}

function checkConflictingDeps(claims: Claim[]): CheckResult[] {
	const results: CheckResult[] = [];

	// Group versioned dep claims by package name
	const versionedByPkg = new Map<string, Claim[]>();
	for (const claim of claims) {
		if (!claim.version) continue;
		const existing = versionedByPkg.get(claim.value) ?? [];
		existing.push(claim);
		versionedByPkg.set(claim.value, existing);
	}

	for (const [pkg, pkgClaims] of versionedByPkg) {
		// Only check across different files
		const byFile = groupByFile(pkgClaims);
		if (byFile.size < 2) continue;

		const versions = new Map<string, Claim>();
		for (const claim of pkgClaims) {
			const existing = versions.get(claim.version!);
			if (existing && existing.file !== claim.file) {
				results.push({
					checker: "cross-file",
					code: "CROSS_FILE_CONFLICT",
					severity: "warning",
					file: claim.file,
					line: claim.line,
					message: `${claim.file}:${claim.line} vs ${existing.file}:${existing.line} — conflicting versions for ${pkg}: "${claim.version}" vs "${existing.version}"`,
					claimed: `${pkg}@${claim.version}`,
					actual: `${pkg}@${existing.version}`,
				});
			}
			if (!existing) {
				versions.set(claim.version!, claim);
			}
		}
	}

	return results;
}

function groupByFile(claims: Claim[]): Map<string, Claim[]> {
	const byFile = new Map<string, Claim[]>();
	for (const claim of claims) {
		const existing = byFile.get(claim.file) ?? [];
		existing.push(claim);
		byFile.set(claim.file, existing);
	}
	return byFile;
}

function normalizeCommand(cmd: string): string {
	return cmd.trim().replace(/\s+/g, " ").toLowerCase();
}

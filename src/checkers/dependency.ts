import type { CargoManifest } from "../parsers/cargo-toml.js";
import type { GoManifest } from "../parsers/go-mod.js";
import type { PackageJsonManifest } from "../parsers/package-json.js";
import type { PythonManifest } from "../parsers/pyproject.js";
import type { CheckerContext, CheckResult, Claim } from "./types.js";

type AnyManifest =
	| PackageJsonManifest
	| PythonManifest
	| GoManifest
	| CargoManifest;

export function checkDependencies(context: CheckerContext): CheckResult[] {
	const results: CheckResult[] = [];
	const depClaims = context.claims.filter((c) => c.type === "dependency");

	const allDeps = collectAllDeps(context.manifests);

	for (const claim of depClaims) {
		const result = checkClaim(claim, allDeps);
		if (result) results.push(result);
	}

	return results;
}

function collectAllDeps(manifests: Map<string, unknown>): Map<string, string> {
	const allDeps = new Map<string, string>();

	for (const manifest of manifests.values()) {
		const m = manifest as AnyManifest;
		if ("dependencies" in m) {
			for (const [name, version] of m.dependencies) {
				allDeps.set(name.toLowerCase(), version);
			}
		}
	}

	return allDeps;
}

function checkClaim(
	claim: Claim,
	allDeps: Map<string, string>,
): CheckResult | null {
	const claimedPkg = claim.value.toLowerCase();

	// Check if the package exists in any manifest
	const actualVersion = allDeps.get(claimedPkg);

	if (actualVersion === undefined) {
		// Package not found in any manifest — but only flag if we have manifests
		if (allDeps.size === 0) return null;

		return {
			checker: "dependency",
			code: "MISSING_DEPENDENCY",
			severity: "warning",
			file: claim.file,
			line: claim.line,
			message: `Claims "${claim.raw}" but "${claimedPkg}" not found in any manifest`,
			claimed: claim.raw,
		};
	}

	// If the claim includes a version, check it
	if (claim.version) {
		const claimedMajor = parseMajor(claim.version);
		const actualMajor = parseMajor(cleanVersion(actualVersion));

		if (
			claimedMajor !== null &&
			actualMajor !== null &&
			claimedMajor !== actualMajor
		) {
			return {
				checker: "dependency",
				code: "STALE_DEPENDENCY",
				severity: "warning",
				file: claim.file,
				line: claim.line,
				message: `Claims "${claim.raw}" but manifest has "${claimedPkg}@${cleanVersion(actualVersion)}"`,
				claimed: `${claimedPkg}@${claim.version}`,
				actual: `${claimedPkg}@${cleanVersion(actualVersion)}`,
			};
		}
	}

	return null;
}

function parseMajor(version: string): number | null {
	const match = version.match(/(\d+)/);
	return match ? Number.parseInt(match[1], 10) : null;
}

function cleanVersion(version: string): string {
	return version.replace(/^[~^>=<\s]+/, "");
}

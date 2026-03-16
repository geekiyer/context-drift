# context-drift

A CLI and GitHub Action that detects when AI context files (`CLAUDE.md`, `AGENTS.md`, `.cursorrules`, etc.) drift out of sync with the actual codebase.

## The Problem

AI coding agents rely on markdown context files to understand project conventions, stack, commands, and structure. These files are written once and rarely updated. Over time they silently rot — dependencies get upgraded, directories get renamed, scripts get removed — and the context file becomes a source of misinformation that actively degrades agent performance.

**context-drift** treats context files as verifiable claims about the repository and checks those claims against ground truth.

## Install

```bash
npm install -g context-drift
```

Or run directly:

```bash
npx context-drift scan
```

## Quick Start

```bash
# Scan the current repo
context-drift scan

# JSON output for CI
context-drift scan --format json

# Treat warnings as errors
context-drift scan --strict

# Generate a config file
context-drift init
```

## Example Output

```
context-drift v0.1.0 — 3 files scanned

CLAUDE.md (last modified: 84 days ago, 217 commits since)
  ⚠  STALE_DEPENDENCY       Line 12: Claims "Express 4" but "express" not found in any manifest
  ⚠  MISSING_PATH           Line 28: References "src/services/" — path not found
  ✗  DEAD_COMMAND            Line 45: "npm run test:e2e" — script "test:e2e" not found in package.json

AGENTS.md
  ⚠  CROSS_FILE_CONFLICT    Line 8: Line 8 vs CLAUDE.md:45 — different test commands

.cursorrules
  ✓  No issues detected

Summary: 3 warnings, 1 error across 3 files
```

## What It Checks

### Staleness

Compares each context file's last-modified date against git history. Reports calendar age and number of commits since the file was last touched.

| Threshold | Warning | Error |
|-----------|---------|-------|
| Days      | 30      | 90    |
| Commits   | 50      | 200   |

### Dependencies

Extracts dependency and stack claims from context files (e.g. "uses React 18", "Express backend") and compares against manifest files:

- `package.json` (Node)
- `requirements.txt` / `pyproject.toml` / `Pipfile` (Python)
- `go.mod` (Go)
- `Cargo.toml` (Rust)

Flags missing packages and major version mismatches.

### Paths

Extracts filesystem path references (e.g. `` `src/components/` ``, `` `lib/utils.ts` ``) and verifies they exist in the repo.

### Commands

Extracts CLI commands (e.g. `` `npm run test:e2e` ``, `` `make build` ``) and verifies:

- npm/yarn/pnpm scripts exist in `package.json`
- make targets exist in `Makefile`

### Cross-File Consistency

When multiple context files exist, detects contradictory claims — different test commands, conflicting stack versions, etc.

## Supported Context Files

Scanned automatically if present at the repo root:

- `CLAUDE.md`
- `AGENTS.md`
- `.cursorrules`
- `.github/copilot-instructions.md`
- `.windsurfrules`
- `GEMINI.md`

Additional files can be added via configuration.

## Configuration

Create a `.context-drift.yml` in your repo root (or run `context-drift init`):

```yaml
# Additional context files to scan
files:
  - docs/AI_CONTEXT.md
  - .claude/project-notes.md

# Override staleness thresholds
staleness:
  warn_days: 30
  warn_commits: 50
  error_days: 90
  error_commits: 200

# Ignore specific checks
ignore:
  - code: STALE_DEPENDENCY
    file: CLAUDE.md
    line: 12
  - code: MISSING_PATH
    pattern: "docs/legacy/*"

# Treat warnings as errors
strict: false
```

## CLI Reference

```
context-drift scan [path]         # Scan repo at path (default: cwd)
context-drift scan --format json  # Machine-readable output
context-drift scan --format github # GitHub Actions annotations
context-drift scan --strict       # Treat warnings as errors (exit 1)
context-drift init                # Generate a starter .context-drift.yml
context-drift version             # Print version
```

### Exit Codes

| Code | Meaning |
|------|---------|
| `0`  | No errors (warnings allowed unless `--strict`) |
| `1`  | One or more errors found |
| `2`  | Configuration or runtime error |

## GitHub Action

```yaml
# .github/workflows/context-drift.yml
name: Context Drift Check
on: [pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # needed for git history
      - uses: context-drift/context-drift-action@v1
        with:
          strict: false
          config: .context-drift.yml  # optional
```

The action posts annotations on specific lines of context files that have drifted.

## Programmatic API

```typescript
import { scan } from "context-drift";

const result = await scan("/path/to/repo");

console.log(result.summary);
// { errors: 1, warnings: 3 }

for (const file of result.results) {
  for (const issue of file.issues) {
    console.log(`${issue.file}:${issue.line} ${issue.code} ${issue.message}`);
  }
}
```

## License

MIT

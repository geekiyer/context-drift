# context-drift

A CLI and GitHub Action that checks whether your AI context files (`CLAUDE.md`, `AGENTS.md`, `.cursorrules`, etc.) still match reality.

## Why this exists

You write a `CLAUDE.md` once, maybe twice. Then the codebase moves on. Dependencies get swapped, folders get renamed, scripts get deleted. Nobody updates the context file because nobody remembers it's there. Now your AI agent is confidently following stale instructions, and you're debugging the wrong thing for an hour before you realize the file lied.

context-drift reads your context files, pulls out the concrete claims (paths, commands, dependency names, versions), and checks them against the repo. If something doesn't line up, it tells you.

## Install

```bash
npm install -g context-drift
```

Or just run it:

```bash
npx context-drift scan
```

## Usage

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

## Example output

```
context-drift v0.1.0 -- 3 files scanned

CLAUDE.md (last modified: 84 days ago, 217 commits since)
  ⚠  STALE_DEPENDENCY       Line 12: Claims "Express 4" but "express" not found in any manifest
  ⚠  MISSING_PATH           Line 28: References "src/services/" -- path not found
  ✗  DEAD_COMMAND            Line 45: "npm run test:e2e" -- script "test:e2e" not found in package.json

AGENTS.md
  ⚠  CROSS_FILE_CONFLICT    Line 8: Line 8 vs CLAUDE.md:45 -- different test commands

.cursorrules
  ✓  No issues detected

Summary: 3 warnings, 1 error across 3 files
```

## What it checks

### Staleness

How old is the file? How many commits have landed since it was last touched?

| Threshold | Warning | Error |
|-----------|---------|-------|
| Days      | 30      | 90    |
| Commits   | 50      | 200   |

### Dependencies

Pulls dependency claims out of context files ("uses React 18", "Express backend") and checks them against your manifest:

- `package.json`
- `requirements.txt` / `pyproject.toml` / `Pipfile`
- `go.mod`
- `Cargo.toml`

Reports missing packages and major version mismatches.

### Paths

Finds path references like `` `src/components/` `` or `` `lib/utils.ts` `` and checks whether they exist.

### Commands

Finds CLI commands like `` `npm run test:e2e` `` or `` `make build` `` and checks:

- npm/yarn/pnpm scripts exist in `package.json`
- make targets exist in `Makefile`

### Cross-file conflicts

When you have multiple context files, context-drift compares them against each other. If `CLAUDE.md` says the test command is `npm test` and `AGENTS.md` says it's `yarn test`, that's a conflict.

## Supported context files

These are scanned automatically if they exist at the repo root:

- `CLAUDE.md`
- `AGENTS.md`
- `.cursorrules`
- `.github/copilot-instructions.md`
- `.windsurfrules`
- `GEMINI.md`

You can add more in the config.

## Configuration

Create `.context-drift.yml` in your repo root, or run `context-drift init`:

```yaml
# Extra context files to scan
files:
  - docs/AI_CONTEXT.md
  - .claude/project-notes.md

# Staleness thresholds
staleness:
  warn_days: 30
  warn_commits: 50
  error_days: 90
  error_commits: 200

# Suppress specific findings
ignore:
  - code: STALE_DEPENDENCY
    file: CLAUDE.md
    line: 12
  - code: MISSING_PATH
    pattern: "docs/legacy/*"

# Treat warnings as errors
strict: false
```

## CLI reference

```
context-drift scan [path]          Scan repo at path (default: cwd)
context-drift scan --format json   Machine-readable output
context-drift scan --format github GitHub Actions annotations
context-drift scan --strict        Treat warnings as errors (exit 1)
context-drift init                 Generate a starter .context-drift.yml
context-drift version              Print version
```

### Exit codes

| Code | Meaning |
|------|---------|
| `0`  | Clean (warnings are allowed unless `--strict`) |
| `1`  | Errors found |
| `2`  | Bad config or runtime failure |

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
          fetch-depth: 0  # full history needed
      - uses: context-drift/context-drift-action@v1
        with:
          strict: false
          config: .context-drift.yml  # optional
```

The action annotates the specific lines that have drifted, right on the PR.

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

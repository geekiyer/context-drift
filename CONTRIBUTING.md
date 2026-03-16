# Contributing to context-drift

Thanks for your interest in contributing. Here's how to get started.

## Setup

```bash
git clone https://github.com/geekiyer/context-drift.git
cd context-drift
pnpm install
pnpm build
pnpm test
```

Requires Node 18+ and pnpm.

## Development workflow

```bash
pnpm dev          # watch mode (rebuilds on changes)
pnpm test         # run tests once
pnpm test:watch   # run tests in watch mode
pnpm lint         # check for lint issues
pnpm lint:fix     # auto-fix lint issues
```

To test your changes against a real repo:

```bash
pnpm build
node dist/cli.js scan /path/to/any/repo
```

## Project layout

- `src/parsers/context-file.ts` -- extracts claims (paths, deps, commands) from markdown
- `src/checkers/` -- one file per checker, each returns `CheckResult[]`
- `src/ai/provider.ts` -- HTTP clients for Anthropic, OpenAI, Ollama
- `src/reporters/` -- output formatters (console, JSON, GitHub annotations)
- `src/scanner.ts` -- orchestrates everything
- `tests/fixtures/` -- sample repos with intentionally drifted context files

## Adding a new checker

1. Create `src/checkers/your-checker.ts` exporting a function with signature `(context: CheckerContext) => CheckResult[]`
2. Import and add it to the `allIssues` array in `src/scanner.ts`
3. Add test fixtures in `tests/fixtures/` and tests in `tests/checkers/`

## Adding a new manifest parser

1. Create `src/parsers/your-manifest.ts`
2. Import and wire it into `src/scanner.ts` where other manifests are parsed
3. Add the manifest type to `KNOWN_PACKAGES` in `src/parsers/context-file.ts` if needed

## Pull requests

- Keep PRs focused. One feature or fix per PR.
- Add tests for new checkers or parsers.
- Run `pnpm lint` before submitting.
- The test suite should pass (`pnpm test`).

## Issues

Check the [open issues](https://github.com/geekiyer/context-drift/issues) for things to work on. Issues labeled `good first issue` are a good starting point.

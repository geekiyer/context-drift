---
name: drift-check
version: 0.2.2
description: |
  Check if AI context files (CLAUDE.md, AGENTS.md, .cursorrules, etc.) have
  drifted out of sync with the codebase. Runs deterministic checks for dead
  paths, stale dependencies, missing scripts, and cross-file conflicts, then
  uses your own LLM to catch semantic drift in prose claims. Optionally fixes
  what it finds.
allowed-tools:
  - Bash
  - Read
  - Edit
  - Glob
  - Grep
  - Write
---

# Drift Check

You are a context file auditor. Your job is to check whether the AI context files in this repo still match reality, and optionally fix what's drifted.

## Prerequisites

context-drift must be installed. If the command is not found, tell the user to run:
```
npm install -g @geekiyer/context-drift
```

## Step 1: Run deterministic checks

Run the deterministic scan first. This catches dead paths, wrong dependencies, missing scripts, cross-file conflicts, and staleness.

```bash
context-drift scan . --format json
```

Parse the JSON output. If there are issues, note them -- you'll report everything together at the end.

## Step 2: Run semantic checks via prepare/commit

Run prepare to get LLM prompts:

```bash
context-drift prepare .
```

Parse the JSON output. For each request in the array:

1. Read the `messages` array from the request
2. The first message (role: "system") contains the checking instructions
3. The second message (role: "user") contains the repo context and sections to check
4. Process these messages yourself -- you are the LLM. Read the system prompt carefully and follow its instructions exactly. Analyze the sections against the provided code evidence. Respond with a JSON array as specified in the system prompt.
5. Collect your response text

Then pipe all responses through commit:

```bash
echo '<json array of {id, content} objects>' | context-drift commit
```

Where each object has:
- `id`: the request's id (e.g. "CLAUDE.md:batch-0")
- `content`: your JSON array response from analyzing that batch

## Step 3: Report results

Combine the deterministic results (step 1) and semantic results (step 2). Present them grouped by file:

For each file with issues:
- Show the file name and staleness info
- List each issue with its severity, line number, and what's wrong
- For semantic issues, show what the file claims vs what the code actually shows

End with the drift score and a summary count.

If no issues were found, say so.

## Step 4: Offer to fix (if issues found)

If any issues were found, ask the user:

"Want me to fix these? I can update the context files to match what the codebase actually shows."

If the user says yes:
- Read each affected context file
- Fix the specific claims that are wrong (update paths, dependency names/versions, commands, prose descriptions)
- Do not rewrite sections that are correct
- Do not change the style or structure of the file
- Show the user what you changed

## Important

- Do NOT skip step 2. The semantic checks catch things deterministic checks miss (outdated prose, wrong architectural descriptions, stale convention claims).
- When processing the semantic prompts in step 2, follow the system prompt instructions strictly. Only flag things you can prove are wrong. Return an empty array if nothing is provably wrong.
- If context-drift is not installed, do not try to replicate its logic manually. Ask the user to install it.

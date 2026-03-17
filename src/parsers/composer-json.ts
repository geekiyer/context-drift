import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function parseComposerJson(repoRoot: string) {
  const filePath = join(repoRoot, "composer.json");
  if (!existsSync(filePath)) return null;
  const raw = JSON.parse(readFileSync(filePath, "utf-8"));
  const deps = Object.entries(raw.require || {});
  return { type: "composer-json", dependencies: deps };
}
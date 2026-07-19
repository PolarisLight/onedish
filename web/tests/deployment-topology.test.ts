import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "../..");

describe("deployment topology", () => {
  test("GitHub Pages explicitly builds the offline demo as its root", () => {
    const workflow = readFileSync(
      resolve(repositoryRoot, ".github/workflows/pages.yml"),
      "utf8",
    );
    const buildStep = workflow.match(
      /- run: pnpm --dir web build[\s\S]*?(?=\n\s{6}- (?:run|uses|name):)/,
    )?.[0];

    expect(buildStep).toBeDefined();
    expect(buildStep).toContain("VITE_BASE_PATH: /onedish/");
    expect(buildStep).toMatch(/VITE_RESTAURANT_FIRST:\s*["']?0["']?/);
  });
});

import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const PARENT_SENTINEL = "onedish-e2e-parent-env-sentinel";
const DOTENV_SENTINEL = "onedish-e2e-root-dotenv-sentinel";

function textFiles(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = resolve(path, entry.name);
    if (entry.isDirectory()) return textFiles(child);
    return /\.(?:html|js)$/.test(entry.name) ? [child] : [];
  });
}

test("E2E builds discard parent and repository-root AMap credentials", () => {
  const temporaryRoot = mkdtempSync(resolve(tmpdir(), "onedish-e2e-isolation-"));
  const temporaryWeb = resolve(temporaryRoot, "web");
  try {
    cpSync(process.cwd(), temporaryWeb, {
      recursive: true,
      filter: (source) => !["node_modules", "dist", "test-results", "playwright-report", "coverage"]
        .includes(source.split(/[\\/]/).at(-1) ?? ""),
    });
    symlinkSync(resolve(process.cwd(), "node_modules"), resolve(temporaryWeb, "node_modules"), "junction");
    writeFileSync(resolve(temporaryRoot, ".env.local"), [
      `VITE_AMAP_JS_KEY=${DOTENV_SENTINEL}`,
      `VITE_AMAP_SECURITY_CODE=${DOTENV_SENTINEL}`,
      "VITE_RESTAURANT_FIRST=0",
      "",
    ].join("\n"));
    execFileSync(process.execPath, [resolve(temporaryWeb, "scripts/e2e-runtime.mjs"), "build"], {
      cwd: temporaryWeb,
      env: {
        ...process.env,
        VITE_AMAP_JS_KEY: PARENT_SENTINEL,
        VITE_AMAP_SECURITY_CODE: PARENT_SENTINEL,
        VITE_AMAP_SERVICE_HOST: "https://sentinel.invalid/_AMapService",
      },
      stdio: "pipe",
    });
    const output = textFiles(resolve(temporaryWeb, "dist"))
      .map((path) => readFileSync(path, "utf8")).join("\n");
    expect(output.includes(PARENT_SENTINEL)).toBe(false);
    expect(output.includes(DOTENV_SENTINEL)).toBe(false);
    expect(output.includes("onedish-e2e-public-key")).toBe(true);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}, 20_000);

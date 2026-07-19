import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const repositoryRoot = resolve(process.cwd(), "..");
const isolatedE2eEnvDir = resolve(process.cwd(), "e2e-env");
const configSource = readFileSync(resolve(process.cwd(), "vite.config.ts"), "utf8");

test("loads normal Vite modes from the repository-root environment directory", () => {
  expect(configSource).toMatch(/mode === "e2e" \? isolatedE2eEnvDir : repositoryRoot/);
  expect(repositoryRoot).not.toBe(isolatedE2eEnvDir);
});

test("keeps the E2E dotenv directory isolated and credential-free", () => {
  const dotenvFiles = readdirSync(isolatedE2eEnvDir)
    .filter((name) => name === ".env" || name.startsWith(".env."));
  expect(dotenvFiles).toEqual([]);
});

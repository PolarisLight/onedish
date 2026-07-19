import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const webRoot = fileURLToPath(new URL("..", import.meta.url));
const tscEntry = fileURLToPath(new URL("../node_modules/typescript/bin/tsc", import.meta.url));
const viteEntry = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url));

const PASSTHROUGH_ENV = [
  "PATH", "Path", "PATHEXT", "SystemRoot", "WINDIR", "COMSPEC",
  "TMP", "TEMP", "TMPDIR", "HOME", "USERPROFILE", "LOCALAPPDATA", "APPDATA",
  "CI", "TERM", "FORCE_COLOR", "NO_COLOR", "LANG", "LC_ALL",
];

function isolatedEnvironment() {
  const env = {};
  for (const name of PASSTHROUGH_ENV) {
    if (process.env[name] !== undefined) env[name] = process.env[name];
  }
  return {
    ...env,
    VITE_AMAP_JS_KEY: "onedish-e2e-public-key",
    VITE_AMAP_SERVICE_HOST: "/_AMapService",
    VITE_AMAP_SECURITY_CODE: "",
    VITE_RESTAURANT_FIRST: "1",
  };
}

const childEnvironment = isolatedEnvironment();

function run(entry, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry, ...args], {
      cwd: webRoot,
      env: childEnvironment,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`E2E command failed (${signal ?? code ?? "unknown"})`));
    });
  });
}

async function build() {
  await run(tscEntry, ["-b"]);
  await run(viteEntry, ["build", "--mode", "e2e"]);
}

async function serve() {
  await build();
  const preview = spawn(process.execPath, [
    viteEntry, "preview", "--host", "127.0.0.1", "--port", "4174",
  ], {
    cwd: webRoot,
    env: childEnvironment,
    stdio: "inherit",
  });
  const forward = (signal) => preview.kill(signal);
  process.once("SIGINT", forward);
  process.once("SIGTERM", forward);
  await new Promise((resolve, reject) => {
    preview.once("error", reject);
    preview.once("exit", (code, signal) => {
      if (code === 0 || signal === "SIGINT" || signal === "SIGTERM") resolve();
      else reject(new Error(`E2E preview failed (${signal ?? code ?? "unknown"})`));
    });
  });
}

const command = process.argv[2];
if (command === "build") await build();
else if (command === "serve") await serve();
else throw new Error("Usage: e2e-runtime.mjs <build|serve>");

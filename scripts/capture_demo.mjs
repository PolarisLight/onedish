import { createRequire } from "node:module";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";

const SCENE_IDS = ["home", "context", "elimination", "winner", "orbit", "privacy", "close"];
const FORBIDDEN_TEXT = ["中文", "隐私", "口味轨道", "帮我选一餐"];
const root = resolve(import.meta.dirname, "..");
const require = createRequire(resolve(root, "web/package.json"));
const { chromium } = require("@playwright/test");
const captureDir = resolve(root, "docs/demo/.build/capture");
const timingPath = resolve(root, "docs/demo/.build/audio/timing.json");
const outputVideo = resolve(captureDir, "capture-session.webm");
const outputTimeline = resolve(captureDir, "capture-timeline.json");

function parseBaseUrl(argv) {
  let value = "http://127.0.0.1:5173/";
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== "--base-url" || !argv[index + 1]) {
      throw new Error(`Usage: node scripts/capture_demo.mjs [--base-url URL]`);
    }
    value = argv[index + 1];
    index += 1;
  }
  const url = new URL(value);
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url;
}

async function loadTiming() {
  let raw;
  try {
    raw = JSON.parse(await readFile(timingPath, "utf8"));
  } catch (error) {
    throw new Error(`Could not read seven-scene audio timing at ${timingPath}: ${error.message}`);
  }
  if (!Array.isArray(raw) || raw.length !== SCENE_IDS.length) {
    throw new Error("Audio timing must contain exactly seven scenes");
  }
  return raw.map((scene, index) => {
    if (
      !scene ||
      scene.id !== SCENE_IDS[index] ||
      typeof scene.duration !== "number" ||
      !Number.isFinite(scene.duration) ||
      scene.duration <= 0 ||
      typeof scene.pause_after_ms !== "number" ||
      !Number.isFinite(scene.pause_after_ms) ||
      scene.pause_after_ms < 0
    ) {
      throw new Error(`Invalid audio timing for scene ${SCENE_IDS[index]}`);
    }
    return {
      id: scene.id,
      minimumSeconds: scene.duration + scene.pause_after_ms / 1000 + 0.8,
    };
  });
}

function roundSeconds(value) {
  return Number(value.toFixed(3));
}

const baseUrl = parseBaseUrl(process.argv.slice(2));
const timing = await loadTiming();
await rm(captureDir, { recursive: true, force: true });
await mkdir(captureDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
let context;
try {
  context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    locale: "en-US",
    recordVideo: { dir: captureDir, size: { width: 390, height: 844 } },
  });
  const page = await context.newPage();
  const video = page.video();
  if (!video) throw new Error("Playwright did not create a video recorder");

  const scenes = [];
  const captureStartedAt = performance.now();

  async function forceEnglish() {
    await page.locator("#root .app-shell").waitFor({ state: "attached" });
    const state = await page.evaluate(() => {
      const english = [...document.querySelectorAll("button")].find(
        (button) => button.textContent?.trim() === "EN",
      );
      const pressed = english?.getAttribute("aria-pressed") === "true";
      if (english && !pressed) english.click();
      return { found: Boolean(english), pressed, language: document.documentElement.lang };
    });
    if (!state.found && state.language !== "en") {
      throw new Error(`Could not find the EN control while language was ${state.language}`);
    }
    await page.waitForFunction(
      () => [...document.querySelectorAll("button")].some(
        (button) => button.textContent?.trim() === "EN" && button.getAttribute("aria-pressed") === "true",
      ),
    );
    await page.evaluate(() => {
      document.documentElement.lang = "en";
      for (const button of document.querySelectorAll("button")) {
        if (button.textContent?.trim() === "中文") button.style.display = "none";
      }
    });
  }

  async function requireEnglishBoundary(id) {
    const state = await page.evaluate((forbidden) => ({
      language: document.documentElement.lang,
      body: document.body?.innerText ?? "",
      forbidden: forbidden.filter((term) => (document.body?.innerText ?? "").includes(term)),
    }), FORBIDDEN_TEXT);
    if (state.language !== "en") {
      throw new Error(`Scene ${id} boundary language was ${state.language}, not en`);
    }
    if (state.forbidden.length) {
      throw new Error(`Scene ${id} boundary contained forbidden text: ${state.forbidden.join(", ")}`);
    }
  }

  async function mark(id, action, { initialBoundary = true } = {}) {
    const timingScene = timing[scenes.length];
    if (!timingScene || timingScene.id !== id) throw new Error(`Unexpected capture scene ${id}`);
    const absoluteStart = performance.now();
    const start = roundSeconds((absoluteStart - captureStartedAt) / 1000);
    if (initialBoundary) await requireEnglishBoundary(id);

    const waitTo = async (fraction) => {
      const target = absoluteStart + timingScene.minimumSeconds * fraction * 1000;
      const remaining = target - performance.now();
      if (remaining > 0) await page.waitForTimeout(remaining);
    };
    await action({ waitTo, minimumSeconds: timingScene.minimumSeconds });
    const remaining = absoluteStart + timingScene.minimumSeconds * 1000 - performance.now();
    if (remaining > 0) await page.waitForTimeout(remaining);
    await requireEnglishBoundary(id);
    const end = roundSeconds((performance.now() - captureStartedAt) / 1000);
    if (end <= start) throw new Error(`Scene ${id} did not have a positive duration`);
    if (scenes.length && start < scenes.at(-1).end) throw new Error(`Scene ${id} overlaps the prior scene`);
    scenes.push({ id, start, end });
  }

  await mark("home", async ({ waitTo }) => {
    await page.goto(baseUrl.href, { waitUntil: "networkidle" });
    await forceEnglish();
    await page.getByRole("button", { name: "Pick my meal", exact: true }).waitFor();
    await requireEnglishBoundary("home");
    await waitTo(0.24);
    await page.getByRole("button", { name: "Hungry", exact: true }).click();
    await waitTo(0.46);
    await page.mouse.wheel(0, 260);
    await waitTo(0.68);
    await page.mouse.wheel(0, -260);
    await waitTo(0.84);
    await page.getByRole("button", { name: "Surprise me", exact: true }).click();
  }, { initialBoundary: false });

  await mark("context", async ({ waitTo }) => {
    await waitTo(0.08);
    await page.getByRole("button", { name: "Adjust", exact: true }).click();
    const sheet = page.getByRole("dialog");
    await sheet.waitFor();
    await waitTo(0.33);
    await sheet.evaluate((element) => element.scrollTo({ top: element.scrollHeight, behavior: "smooth" }));
    await waitTo(0.58);
    await sheet.evaluate((element) => element.scrollTo({ top: 0, behavior: "smooth" }));
    await waitTo(0.82);
    await sheet.getByRole("button", { name: "Cancel", exact: true }).click();
    await sheet.waitFor({ state: "hidden" });
  });

  await mark("elimination", async ({ waitTo }) => {
    await waitTo(0.05);
    await page.getByRole("button", { name: "Pick my meal", exact: true }).click();
    await page.getByRole("heading", { name: "From ninety to one.", exact: true }).waitFor();
    await waitTo(0.30);
    await page.mouse.wheel(0, 220);
    await waitTo(0.52);
    await page.mouse.wheel(0, -160);
    await waitTo(0.76);
    await page.getByRole("button", { name: "Meet your dish", exact: true }).scrollIntoViewIfNeeded();
  });

  await mark("winner", async ({ waitTo }) => {
    await waitTo(0.05);
    await page.getByRole("button", { name: "Meet your dish", exact: true }).click();
    await page.getByText("Why this one", { exact: true }).waitFor();
    const heading = page.locator("main.winner h1");
    if (!(await heading.textContent())?.trim()) throw new Error("Winner scene did not expose a dish heading");
    await waitTo(0.27);
    await page.getByText("Why this one", { exact: true }).scrollIntoViewIfNeeded();
    await waitTo(0.48);
    await page.getByRole("button", { name: "Pick another", exact: true }).scrollIntoViewIfNeeded();
    await waitTo(0.66);
    const firstDecisionUrl = page.url();
    await page.getByRole("button", { name: "Pick another", exact: true }).click();
    await page.waitForURL(
      (url) => url.href !== firstDecisionUrl && url.pathname.startsWith("/winner/"),
    );
    await page.waitForFunction(() => {
      const retry = [...document.querySelectorAll("button")].find(
        (button) => button.textContent?.trim() === "Pick another",
      );
      return retry instanceof HTMLButtonElement && !retry.disabled;
    });
    if (!(await heading.textContent())?.trim()) throw new Error("Retry did not expose a winner result");
    await waitTo(0.80);
    await heading.scrollIntoViewIfNeeded();
  });

  await mark("orbit", async ({ waitTo }) => {
    await page.goto(new URL("history", baseUrl).href, { waitUntil: "networkidle" });
    await forceEnglish();
    await page.getByRole("heading", { name: "Your taste is taking shape.", exact: true }).waitFor();
    const firstSignal = page.locator(".orbit-signal").first();
    await firstSignal.waitFor();
    await waitTo(0.36);
    await firstSignal.evaluate((button) => button.click());
    await page.waitForFunction(
      () => document.querySelector(".orbit-signal")?.getAttribute("aria-pressed") === "true",
    );
    await page.locator(".orbit-detail small").getByText("Choose YOU to see the full orbit", { exact: true }).waitFor();
    await waitTo(0.66);
    await page.getByRole("button", { name: "YOU", exact: true }).click();
    await page.waitForFunction(
      () => document.querySelector(".orbit-signal")?.getAttribute("aria-pressed") === "false",
    );
    await waitTo(0.82);
    await page.mouse.wheel(0, 100);
  });

  await mark("privacy", async ({ waitTo }) => {
    await page.goto(new URL("privacy", baseUrl).href, { waitUntil: "networkidle" });
    await forceEnglish();
    await page.getByRole("heading", { name: "Your body is not the product.", exact: true }).waitFor();
    const map = page.locator(".privacy-map");
    await waitTo(0.30);
    await page.getByRole("button", { name: "Health signals", exact: true }).click();
    await waitTo(0.57);
    await page.getByRole("button", { name: "Precise location", exact: true }).click();
    await page.getByText("OpenStreetMap", { exact: true }).first().waitFor();
    await waitTo(0.74);
    await map.scrollIntoViewIfNeeded();
  });

  await mark("close", async ({ waitTo }) => {
    await page.goto(baseUrl.href, { waitUntil: "networkidle" });
    await forceEnglish();
    await page.getByRole("button", { name: "Pick my meal", exact: true }).waitFor();
    await waitTo(0.32);
    await page.mouse.wheel(0, 180);
    await waitTo(0.53);
    await page.mouse.wheel(0, -180);
    await waitTo(0.72);
    await page.getByRole("button", { name: "Pick my meal", exact: true }).focus();
  });

  const timeline = { language: "en", scenes };
  if (scenes.map(({ id }) => id).join(",") !== SCENE_IDS.join(",")) {
    throw new Error("Capture timeline scene order is invalid");
  }
  await writeFile(outputTimeline, `${JSON.stringify(timeline, null, 2)}\n`, "utf8");
  await context.close();
  context = undefined;
  await video.saveAs(outputVideo);
  console.log("Captured 7 English scenes");
} finally {
  if (context) await context.close();
  await browser.close();
}

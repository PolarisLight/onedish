import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const require = createRequire(resolve(root, "web/package.json"));
const { chromium } = require("@playwright/test");
const frames = resolve(root, "docs/demo/frames");
await mkdir(frames, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await context.newPage();
const shot = (name) => page.screenshot({ path: resolve(frames, `${name}.png`) });

await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
await page.waitForTimeout(900);
await shot("home");

await page.getByRole("link", { name: "Preview context" }).click();
await page.getByText("Allergies and budget").click();
await page.getByLabel("Energy eaten today").fill("1180");
await page.getByLabel("Protein eaten today").fill("72");
await page.getByLabel("What sounds good?").fill("Warm, filling, not too greasy");
await page.getByLabel("Exclude allergens").fill("Peanuts");
await shot("context");

await page.goto("http://127.0.0.1:5173/");
await page.getByRole("button", { name: "Try the demo" }).click();
await page.getByRole("heading", { name: "From ninety to one." }).waitFor();
await shot("elimination");
await page.waitForTimeout(3600);
await page.getByText("One dish", { exact: true }).scrollIntoViewIfNeeded();
await shot("elimination-final");

await page.getByRole("button", { name: "Meet your dish" }).click();
await page.getByRole("heading", { name: "Charred Chicken Rice Bowl" }).waitFor();
await shot("winner");

await page.getByRole("button", { name: "Not today" }).click();
await shot("rejection");
await page.getByRole("button", { name: "Not craving it" }).click();

await page.getByRole("link", { name: "Taste Orbit" }).click();
await page.getByRole("heading", { name: "Your taste has an orbit." }).waitFor();
await shot("orbit");

await page.getByRole("link", { name: "Privacy" }).click();
await page.getByRole("heading", { name: "Your body is not the product." }).waitFor();
await shot("privacy");

await browser.close();
console.log(`Captured demo frames in ${frames}`);

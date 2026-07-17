import { expect, test } from "@playwright/test";

test("installed demo remains usable after the network disappears", async ({ context, page }) => {
  await page.goto("/");
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText("Synthetic demo context")).toBeVisible();
  await page.getByRole("button", { name: "Try the demo" }).click();
  await expect(page.getByRole("heading", { name: "From ninety to one." })).toBeVisible();
  await page.getByRole("button", { name: "Show result" }).click();
  await expect(page.getByRole("heading", { name: "Charred Chicken Rice Bowl" })).toBeVisible();
});

test("manifest exposes standalone mode and required icons", async ({ request }) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBeTruthy();
  const payload = await manifest.json();
  expect(payload.display).toBe("standalone");
  expect(payload.icons.map((icon: { sizes: string }) => icon.sizes)).toEqual(
    expect.arrayContaining(["192x192", "512x512"]),
  );
});

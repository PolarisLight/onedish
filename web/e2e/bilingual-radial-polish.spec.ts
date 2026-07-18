import { expect, test } from "@playwright/test";

async function createHistory(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Pick my meal" }).click();
  const skip = page.getByRole("button", { name: "Skip" });
  const meet = page.getByRole("button", { name: "Meet your dish" });
  await expect(skip.or(meet)).toBeVisible();
  if (await skip.isVisible()) await skip.click();
  await meet.click();
  await expect(page.getByRole("heading", { name: "Why this one" })).toBeVisible();
}

test("radial nodes and privacy receiver use the shared geometry contract", async ({ page }) => {
  await createHistory(page);
  await page.goto("/history");
  const nodes = page.locator(".radial-node-position");
  await expect(nodes.first()).toBeVisible();
  const trackErrors = await nodes.evaluateAll((items) => {
    const stage = document.querySelector(".orbit-stage")!.getBoundingClientRect();
    const center = { x: stage.left + stage.width / 2, y: stage.top + stage.height / 2 };
    return items.map((item) => {
      const bounds = item.getBoundingClientRect();
      const radius = Number((item as HTMLElement).dataset.trackRadius);
      const nodeCenter = {
        x: bounds.left + bounds.width / 2,
        y: bounds.top + bounds.height / 2,
      };
      const distance = Math.hypot(nodeCenter.x - center.x, nodeCenter.y - center.y);
      return Math.abs(distance - radius * stage.width);
    });
  });
  expect(Math.max(...trackErrors)).toBeLessThanOrEqual(1);

  const signal = page.locator(".orbit-signal").first();
  await signal.click({ force: true });
  await page.waitForTimeout(700);
  const focus = await signal.evaluate((button) => {
    const stage = document.querySelector(".orbit-stage")!.getBoundingClientRect();
    const node = button.closest(".radial-node-position")!.getBoundingClientRect();
    const layerTransform = getComputedStyle(document.querySelector(".orbit-node-layer")!).transform;
    const labelTransform = getComputedStyle(button.querySelector("span")!).transform;
    const layer = new DOMMatrix(layerTransform);
    const label = new DOMMatrix(labelTransform);
    const angle = (matrix: DOMMatrix) => Math.atan2(matrix.b, matrix.a) * 180 / Math.PI;
    return {
      xError: Math.abs(node.left + node.width / 2 - (stage.left + stage.width / 2)),
      isAboveCenter: node.top + node.height / 2 < stage.top + stage.height / 2,
      labelAngleError: Math.abs(((angle(layer) + angle(label) + 540) % 360) - 180),
    };
  });
  expect(focus.xError).toBeLessThanOrEqual(2);
  expect(focus.isAboveCenter).toBe(true);
  expect(focus.labelAngleError).toBeLessThanOrEqual(.5);

  await page.goto("/privacy");
  await page.getByRole("button", { name: "Health signals" }).click();
  await expect(page.getByTestId("privacy-outbound-connector")).not.toBeAttached();
  await page.getByRole("button", { name: "Precise location" }).click();
  await expect(page.getByTestId("privacy-receiver")).toBeVisible();
  await expect(page.getByTestId("privacy-outbound-connector")).toBeVisible();
  const overlap = await page.evaluate(() => {
    const health = document.querySelector('[data-privacy-id="health_signals"]')!.getBoundingClientRect();
    const receiver = document.querySelector('[data-testid="privacy-receiver"]')!.getBoundingClientRect();
    return health.left < receiver.right && health.right > receiver.left &&
      health.top < receiver.bottom && health.bottom > receiver.top;
  });
  expect(overlap).toBe(false);
});

test("a stored decision switches to reviewed Chinese dish copy", async ({ page }) => {
  await createHistory(page);
  await page.getByRole("button", { name: "中文" }).click();
  await expect(page.getByRole("heading", { name: "炭烤鸡肉饭" })).toBeVisible();
  await expect(page.getByText("炭烤鸡肉搭配米饭和时蔬，香气浓郁，饱腹感十足。")).toBeVisible();
});

test("privacy geometry fits a 320px viewport without collisions", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/privacy");
  await page.getByRole("button", { name: "Precise location" }).click();
  await expect(page.getByTestId("privacy-receiver")).toBeVisible();
  const result = await page.evaluate(() => {
    const stage = document.querySelector(".privacy-map")!.getBoundingClientRect();
    const entries = [...document.querySelectorAll("[data-privacy-id]")]
      .map((element) => ({ id: (element as HTMLElement).dataset.privacyId, box: element.getBoundingClientRect() }));
    const boxes = entries.map(({ box }) => box);
    const categoryOverlap = boxes.some((box, index) => boxes.slice(index + 1).some((other) => (
      box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top
    )));
    return {
      categoryOverlap,
      outsideStage: entries.filter(({ box }) => !(
        box.left >= stage.left && box.right <= stage.right &&
        box.top >= stage.top && box.bottom <= stage.bottom
      )).map(({ id, box }) => ({
        id,
        left: Math.round((box.left - stage.left) * 10) / 10,
        right: Math.round((stage.right - box.right) * 10) / 10,
        top: Math.round((box.top - stage.top) * 10) / 10,
        bottom: Math.round((stage.bottom - box.bottom) * 10) / 10,
      })),
      overflows: document.documentElement.scrollWidth > window.innerWidth,
    };
  });
  expect(result).toEqual({ categoryOverlap: false, outsideStage: [], overflows: false });
});

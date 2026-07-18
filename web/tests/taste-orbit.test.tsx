import { act, fireEvent, render, screen } from "@testing-library/react";
import { db, resetLocalData, saveHistoryEvent } from "../src/db/db";
import { TasteOrbitPage } from "../src/history/TasteOrbitPage";
import { LocaleProvider } from "../src/i18n/locale";

beforeEach(() => resetLocalData());

async function renderOrbit() {
  await act(async () => { render(<LocaleProvider><TasteOrbitPage /></LocaleProvider>); });
}

test("uses real history and switches between seven and thirty days", async () => {
  const now = Date.now();
  await saveHistoryEvent({ id: "warm", occurred_at: new Date(now - 86_400_000).toISOString(), kind: "accepted", taste_tags: ["warm"] });
  await saveHistoryEvent({ id: "fresh", occurred_at: new Date(now - 10 * 86_400_000).toISOString(), kind: "eaten", taste_tags: ["fresh"] });
  await renderOrbit();
  expect(screen.getByRole("heading", { name: "Your taste is taking shape." })).toBeVisible();
  expect(await screen.findByRole("button", { name: /warm, 1 signal/i })).toBeVisible();
  expect(screen.queryByRole("button", { name: /fresh, 1 signal/i })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "30 DAYS" }));
  expect(await screen.findByRole("button", { name: /fresh, 1 signal/i })).toBeVisible();
});

test("focus persists until YOU returns to natural rotation", async () => {
  await saveHistoryEvent({ id: "warm", occurred_at: new Date().toISOString(), kind: "accepted", taste_tags: ["warm"] });
  await renderOrbit();
  const warm = await screen.findByRole("button", { name: /warm, 1 signal/i });
  fireEvent.click(warm);
  expect(warm).toHaveAttribute("aria-pressed", "true");
  expect(warm).toHaveAttribute("data-focus-target", "top");
  fireEvent.click(screen.getByRole("button", { name: "YOU" }));
  expect(warm).toHaveAttribute("aria-pressed", "false");
});

test("renders every signal on its assigned shared track", async () => {
  await saveHistoryEvent({
    id: "spicy",
    occurred_at: new Date().toISOString(),
    kind: "accepted",
    taste_tags: ["spicy"],
  });
  await renderOrbit();
  const node = await screen.findByRole("button", { name: /spicy, 1 signal/i });
  expect(node.closest("[data-radial-position]")).toHaveAttribute(
    "data-track-radius",
    expect.stringMatching(/^0\.(22|32|42)$/),
  );
});

test("localizes canonical tags in the Chinese interface", async () => {
  await db.settings.put({ key: "locale.v2", value: "zh-CN" });
  await saveHistoryEvent({
    id: "spicy",
    occurred_at: new Date().toISOString(),
    kind: "accepted",
    taste_tags: ["spicy"],
  });
  await renderOrbit();
  expect(await screen.findByRole("button", { name: /香辣/ })).toBeVisible();
  expect(screen.queryByText("SPICY")).not.toBeInTheDocument();
});

test("shows a truthful empty state instead of demo history", async () => {
  await renderOrbit();
  expect(await screen.findByRole("heading", { name: "Your next choice starts the orbit." })).toBeVisible();
  expect(screen.queryByRole("button", { name: /warm/i })).not.toBeInTheDocument();
});

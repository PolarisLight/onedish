import { act, fireEvent, render, screen } from "@testing-library/react";
import { resetLocalData, saveHistoryEvent } from "../src/db/db";
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

test("shows a truthful empty state instead of demo history", async () => {
  await renderOrbit();
  expect(await screen.findByRole("heading", { name: "Your orbit starts with your next meal." })).toBeVisible();
  expect(screen.queryByRole("button", { name: /warm/i })).not.toBeInTheDocument();
});

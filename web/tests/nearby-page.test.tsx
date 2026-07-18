import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import record from "../public/demo/day1.json";
import { db, resetLocalData, saveDecision } from "../src/db/db";
import { LocaleProvider } from "../src/i18n/locale";
import { NearbyPage } from "../src/nearby/NearbyPage";
import { listPrivacyAccessEvents, setLocationPermission } from "../src/privacy/privacy-store";

async function renderNearby(locale: "en" | "zh-CN" = "en") {
  await resetLocalData();
  await db.settings.put({ key: "locale.v2", value: locale });
  await saveDecision({ id: record.decision.decision_id, stateId: "day1", payload: record });
  const router = createMemoryRouter(
    [{ path: "/nearby/:decisionId", element: <NearbyPage /> }],
    { initialEntries: [`/nearby/${record.decision.decision_id}`] },
  );
  await act(async () => { render(<LocaleProvider><RouterProvider router={router} /></LocaleProvider>); });
}

test("nearby localizes interface copy and preserves the source dish name", async () => {
  await renderNearby("zh-CN");
  expect(await screen.findByRole("heading", { name: "去附近找到它。" })).toBeVisible();
  expect(screen.getByText(record.winner.dish.name, { exact: false })).toBeVisible();
  expect(screen.getByRole("button", { name: "使用当前位置" })).toBeVisible();
});

test("asks for explicit consent before requesting coordinates and records a coordinate-free access event", async () => {
  const getCurrentPosition = vi.fn((success: PositionCallback) => success({ coords: { latitude: 31.23, longitude: 121.47, accuracy: 30 } } as GeolocationPosition));
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition } });
  await renderNearby();
  fireEvent.click(await screen.findByRole("button", { name: "Use current location" }));
  expect(getCurrentPosition).not.toHaveBeenCalled();
  expect(await screen.findByRole("dialog", { name: "Share location for this map?" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Allow once" }));
  await waitFor(() => expect(getCurrentPosition).toHaveBeenCalledTimes(1));
  const events = await listPrivacyAccessEvents();
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ category: "precise_location", purpose: "nearby_map", recipient: "OpenStreetMap" });
  expect(JSON.stringify(events[0])).not.toMatch(/31\.23|121\.47|latitude|longitude/);
});

test("respects a revoked location setting before opening consent", async () => {
  const getCurrentPosition = vi.fn();
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition } });
  await renderNearby();
  await setLocationPermission(false);
  fireEvent.click(await screen.findByRole("button", { name: "Use current location" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(getCurrentPosition).not.toHaveBeenCalled();
  expect(await screen.findByText("Location requests are off in Privacy. Enter an area instead.")).toBeVisible();
});

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import record from "../public/demo/day1.json";
import { db, resetLocalData, saveDecision } from "../src/db/db";
import { LocaleProvider } from "../src/i18n/locale";
import { NearbyPage } from "../src/nearby/NearbyPage";
import { listPrivacyAccessEvents, setLocationPermission } from "../src/privacy/privacy-store";

afterEach(() => vi.restoreAllMocks());

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

test("nearby uses the localized dish name in Chinese", async () => {
  await renderNearby("zh-CN");
  expect(await screen.findByRole("heading", { name: "去附近找到它。" })).toBeVisible();
  expect(screen.getByText("炭烤鸡肉饭", { exact: false })).toBeVisible();
  expect(screen.queryByText(record.winner.dish.name, { exact: false })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "使用当前位置" })).toBeVisible();
});

test("asks for explicit consent before requesting coordinates and records a coordinate-free access event", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("[]", { status: 200 }));
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
  expect(events[0]).toMatchObject({ category: "precise_location", purpose: "nearby_map", recipient: "AMap Places + OpenStreetMap" });
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

test("loads and renders attributed AMap restaurants after one-time consent", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify([
    {
      id: "B0AMAP123",
      name: "小杨生煎",
      category: "生煎",
      distance_m: 128,
      price_tier: 2,
      rating: 4.7,
      open_state: "unknown",
      order_destination: "https://uri.amap.com/marker?position=121.47%2C31.23",
      source_kind: "amap_place",
      attribution: "高德地图",
      address: "南京西路测试号",
      average_cost_minor: 3600,
      currency: "CNY",
      latitude: 31.2312,
      longitude: 121.4742,
      photo_url: "https://example.com/restaurant.jpg",
    },
  ]), { status: 200, headers: { "Content-Type": "application/json" } }));
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition: (success: PositionCallback) => success({ coords: { latitude: 31.23, longitude: 121.47, accuracy: 30 } } as GeolocationPosition) },
  });
  await renderNearby("zh-CN");

  fireEvent.click(await screen.findByRole("button", { name: "使用当前位置" }));
  fireEvent.click(await screen.findByRole("button", { name: "仅允许这一次" }));

  expect(await screen.findByText("小杨生煎")).toBeVisible();
  expect(screen.getByText("生煎 · 约 128 米")).toBeVisible();
  expect(screen.getByText("评分 4.7")).toBeVisible();
  expect(screen.getByText("人均约 ¥36")).toBeVisible();
  expect(screen.getByText("地点数据：高德地图")).toBeVisible();
  expect(screen.getByRole("link", { name: "在高德地图中打开" })).toHaveAttribute("href", expect.stringContaining("uri.amap.com"));
  expect(fetchMock).toHaveBeenCalledWith("/api/v1/places/nearby", expect.objectContaining({
    method: "POST",
    body: JSON.stringify({ latitude: 31.23, longitude: 121.47, radius_m: 3000, limit: 10 }),
  }));
});

test("shows a localized bounded error when live discovery is unavailable", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("unavailable", { status: 503 }));
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition: (success: PositionCallback) => success({ coords: { latitude: 31.23, longitude: 121.47, accuracy: 30 } } as GeolocationPosition) },
  });
  await renderNearby();

  fireEvent.click(await screen.findByRole("button", { name: "Use current location" }));
  fireEvent.click(await screen.findByRole("button", { name: "Allow once" }));

  expect(await screen.findByText("Nearby restaurant search is unavailable. Try again.")).toBeVisible();
  expect(screen.queryByText(record.winner.place.name)).not.toBeInTheDocument();
});

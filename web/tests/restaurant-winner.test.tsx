import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db, resetLocalData } from "../src/db/db";
import { LocaleProvider } from "../src/i18n/locale";
import { RestaurantWinnerPage } from "../src/restaurants/RestaurantWinnerPage";
import { parseRestaurantRecommendation } from "../src/restaurants/parser";
import {
  clearRestaurantSessions,
  createRestaurantSession,
} from "../src/restaurants/session-store";
import { restaurantRequest, restaurantResponse } from "./support/restaurant-fixtures";


beforeEach(async () => {
  clearRestaurantSessions();
  await resetLocalData();
});
afterEach(() => vi.restoreAllMocks());

function renderWinner(
  response = restaurantResponse(),
  request = restaurantRequest(),
) {
  const id = createRestaurantSession(request, parseRestaurantRecommendation(response));
  render(
    <LocaleProvider>
      <MemoryRouter initialEntries={[`/restaurants/winner/${id}`]}>
        <Routes>
          <Route path="/restaurants/winner/:sessionId" element={<RestaurantWinnerPage />} />
        </Routes>
      </MemoryRouter>
    </LocaleProvider>,
  );
}

it("binds real evidence to each candidate while rotating without another fetch", () => {
  const fetchSpy = vi.spyOn(window, "fetch");
  renderWinner();
  expect(screen.getByRole("heading", { name: "First" })).toBeVisible();
  expect(screen.getByText("Matches: Japanese")).toBeVisible();
  expect(screen.getByText("Search radius: 3 km")).toBeVisible();
  expect(screen.getByText("Known price is within your budget")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Pick another" }));
  expect(screen.getByRole("heading", { name: "Second" })).toBeVisible();
  expect(screen.getByText("Budget not verified")).toBeVisible();
  expect(screen.queryByText("Known price is within your budget")).not.toBeInTheDocument();
  expect(fetchSpy).not.toHaveBeenCalled();
});

it("shows exact stretch overage in the active currency", () => {
  const response = restaurantResponse();
  Object.assign(response.ranked[0]!, {
    budget_state: "stretch",
    budget_overage_minor: 800,
    reason_codes: ["tag_match", "budget_stretch"],
  });
  renderWinner(response);
  expect(screen.getByText("$8.00 above budget, within your stretch range")).toBeVisible();
});

it("stores only explicit user intent before opening navigation", async () => {
  const open = vi.spyOn(window, "open").mockImplementation(() => null);
  renderWinner();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Go here" }));
  });
  await waitFor(async () => expect(await db.restaurantIntentEvents.count()).toBe(1));
  const event = await db.restaurantIntentEvents.toCollection().first();
  expect(event).toMatchObject({
    action: "accepted",
    selected_tags: ["japanese"],
    budget_band_minor: 5000,
  });
  const serialized = JSON.stringify(event);
  expect(serialized).not.toMatch(/First|overture|address|rating|navigation|latitude|longitude/);
  expect(open).toHaveBeenCalledWith(
    "https://www.openstreetmap.org/",
    "_blank",
    "noopener,noreferrer",
  );
});

it("does not infer or persist a tag when the user selected none", async () => {
  vi.spyOn(window, "open").mockImplementation(() => null);
  const request = restaurantRequest();
  request.profile.selected_tags = [] as never;
  renderWinner(restaurantResponse(), request);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Go here" }));
  });
  expect(await db.restaurantIntentEvents.count()).toBe(0);
});

it("shows active-only protection only for AMap candidates", () => {
  const response = restaurantResponse();
  Object.assign(response.ranked[0]!.candidate, {
    id: "amap:B0TEST",
    source_kind: "amap_place",
    persistence: "active_only",
    attribution: "高德地图",
  });
  renderWinner(response);
  expect(screen.getByText(/used for this result only/i)).toBeVisible();
});

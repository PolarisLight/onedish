import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { RestaurantRequestError } from "../src/api/client";
import * as dbApi from "../src/db/db";
import { HomePage } from "../src/home/HomePage";
import { LocaleProvider } from "../src/i18n/locale";


const { requestCurrentLocation, startRestaurantRecommendation } = vi.hoisted(() => ({
  requestCurrentLocation: vi.fn(),
  startRestaurantRecommendation: vi.fn(),
}));

vi.mock("../src/location/geolocation", () => ({ requestCurrentLocation }));
vi.mock("../src/restaurants/start", () => ({ startRestaurantRecommendation }));
vi.mock("../src/location/LandmarkPicker", () => ({
  LandmarkPicker: ({ onConfirm }: {
    onConfirm: (poi: {
      id: string;
      name: string;
      address: string;
      latitude: number;
      longitude: number;
    }) => void;
  }) => (
    <div role="dialog" aria-label="Choose a meeting place">
      <button onClick={() => onConfirm({
        id: "B0FF",
        name: "Xiamen MixC",
        address: "Hubin East Road",
        latitude: 24.5,
        longitude: 118.1,
      })}>Confirm fixture landmark</button>
    </div>
  ),
}));

beforeEach(async () => {
  await dbApi.resetLocalData();
  vi.clearAllMocks();
  requestCurrentLocation.mockResolvedValue({
    latitude: 24.48,
    longitude: 118.09,
    accuracy_m: 20,
    source: "device",
  });
  startRestaurantRecommendation.mockResolvedValue("session-1");
});

afterEach(() => vi.restoreAllMocks());

function renderHome() {
  render(
    <LocaleProvider>
      <MemoryRouter>
        <Routes>
          <Route path="*" element={<HomePage />} />
        </Routes>
      </MemoryRouter>
    </LocaleProvider>,
  );
}

test("keeps the main journey one tap and omits unsupported meal claims", async () => {
  renderHome();
  expect(await screen.findByRole("button", { name: "See what to eat" })).toBeVisible();
  expect(screen.getByText("Any restaurant style · No budget filter")).toBeVisible();
  expect(screen.queryByText(/breakfast|lunch|dinner/i)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/allergen|time available|ingredient/i)).not.toBeInTheDocument();
});

test("opens restaurant-only preferences and persists multiple tags", async () => {
  renderHome();
  fireEvent.click(await screen.findByRole("button", { name: "Adjust" }));
  expect(screen.getByRole("dialog", { name: "Restaurant preferences" })).toBeVisible();
  expect(screen.queryByRole("checkbox", { name: "Peanuts" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("checkbox", { name: "Japanese" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Hot pot" }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
  });
  expect(await dbApi.getRestaurantPreferences({
    selected_tags: [], budget_minor: 2500, budget_is_explicit: false,
  })).toMatchObject({ selected_tags: ["japanese", "hot_pot"] });
});

test("sends the selected point, restaurant preferences, and safe intents", async () => {
  await dbApi.saveRestaurantPreferences({
    selected_tags: ["japanese"], budget_minor: 5000, budget_is_explicit: true,
  });
  await dbApi.saveRestaurantIntent({
    id: "intent", occurred_at: new Date().toISOString(), action: "accepted",
    selected_tags: ["japanese"], budget_band_minor: 5000,
  });
  renderHome();
  fireEvent.click(await screen.findByRole("button", { name: "Choose another place" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm fixture landmark" }));
  await waitFor(() => expect(startRestaurantRecommendation).toHaveBeenCalledWith(
    expect.objectContaining({
      point: { latitude: 24.5, longitude: 118.1 },
      locale: "en",
      preferences: expect.objectContaining({ selected_tags: ["japanese"] }),
      recentIntents: [expect.objectContaining({ id: "intent" })],
    }),
    expect.objectContaining({ canCommit: expect.any(Function) }),
  ));
  expect(await dbApi.db.settings.get("selected_poi")).toBeUndefined();
});

test("records device-location access without storing coordinates", async () => {
  renderHome();
  fireEvent.click(await screen.findByRole("button", { name: "See what to eat" }));
  fireEvent.click(screen.getByRole("button", { name: "Allow once" }));
  await waitFor(() => expect(startRestaurantRecommendation).toHaveBeenCalled());
  const events = await dbApi.db.privacyAccessEvents.toArray();
  expect(events).toHaveLength(1);
  expect(JSON.stringify(events)).not.toMatch(/24\.48|118\.09|latitude|longitude/);
});

test("continues the recommendation when the local privacy log cannot be written", async () => {
  vi.spyOn(dbApi.db.privacyAccessEvents, "put").mockRejectedValueOnce(
    new Error("storage unavailable"),
  );
  renderHome();
  fireEvent.click(await screen.findByRole("button", { name: "See what to eat" }));
  fireEvent.click(screen.getByRole("button", { name: "Allow once" }));
  await waitFor(() => expect(startRestaurantRecommendation).toHaveBeenCalledOnce());
  expect(screen.queryByText("We could not use your location.")).not.toBeInTheDocument();
});

test("clears tags and retries from the already consented point after no match", async () => {
  await dbApi.saveRestaurantPreferences({
    selected_tags: ["japanese"], budget_minor: 5000, budget_is_explicit: true,
  });
  startRestaurantRecommendation
    .mockRejectedValueOnce(new RestaurantRequestError(
      409,
      "no_match",
      ["clear_tags", "ignore_budget"],
    ))
    .mockResolvedValueOnce("session-2");
  renderHome();
  fireEvent.click(await screen.findByRole("button", { name: "See what to eat" }));
  fireEvent.click(screen.getByRole("button", { name: "Allow once" }));
  expect(await screen.findByText("No restaurant matched those conditions within 5 km.")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Clear categories" }));
  await waitFor(() => expect(startRestaurantRecommendation).toHaveBeenCalledTimes(2));
  expect(startRestaurantRecommendation.mock.calls[1]?.[0]).toMatchObject({
    point: { latitude: 24.48, longitude: 118.09 },
    preferences: { selected_tags: [], budget_minor: 5000, budget_is_explicit: true },
  });
  expect(requestCurrentLocation).toHaveBeenCalledOnce();
});

test("provider failure offers a retry without changing the request", async () => {
  startRestaurantRecommendation
    .mockRejectedValueOnce(new RestaurantRequestError(503, "provider_unavailable"))
    .mockResolvedValueOnce("session-2");
  renderHome();
  fireEvent.click(await screen.findByRole("button", { name: "See what to eat" }));
  fireEvent.click(screen.getByRole("button", { name: "Allow once" }));
  expect(await screen.findByText("Restaurant search is temporarily unavailable.")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Retry search" }));
  await waitFor(() => expect(startRestaurantRecommendation).toHaveBeenCalledTimes(2));
  expect(requestCurrentLocation).toHaveBeenCalledOnce();
});

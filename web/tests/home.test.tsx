import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router";
import * as dbApi from "../src/db/db";
import { HomePage } from "../src/home/HomePage";
import { LocaleProvider } from "../src/i18n/locale";
import type { UserProfile } from "../src/recommendation/types";

const { requestCurrentLocation, startRestaurantRecommendation } = vi.hoisted(() => ({
  requestCurrentLocation: vi.fn(),
  startRestaurantRecommendation: vi.fn(),
}));

vi.mock("../src/location/geolocation", () => ({ requestCurrentLocation }));
vi.mock("../src/restaurants/start", () => ({ startRestaurantRecommendation }));
vi.mock("../src/location/LandmarkPicker", () => ({
  LandmarkPicker: ({ onClose, onConfirm }: {
    onClose: () => void;
    onConfirm: (poi: { id: string; name: string; address: string; latitude: number; longitude: number }) => void;
  }) => <div role="dialog" aria-label="Choose a meeting place">
    <button onClick={onClose}>Close map</button>
    <button onClick={() => onConfirm({
      id: "B0FF",
      name: "Xiamen MixC",
      address: "Hubin East Road",
      latitude: 24.5,
      longitude: 118.1,
    })}>Confirm fixture landmark</button>
  </div>,
}));

beforeEach(async () => {
  await dbApi.resetLocalData();
  localStorage.clear();
  vi.clearAllMocks();
  requestCurrentLocation.mockResolvedValue({ latitude: 24.48, longitude: 118.09, accuracy_m: 20, source: "device" });
  startRestaurantRecommendation.mockResolvedValue("session-1");
});

afterEach(() => vi.restoreAllMocks());

function renderHome() {
  return render(
    <LocaleProvider>
      <MemoryRouter><HomePage /></MemoryRouter>
    </LocaleProvider>,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function renderRoutedHome() {
  render(<LocaleProvider><MemoryRouter>
    <Link to="/elsewhere">Leave journey</Link>
    <Link to="/">Return home</Link>
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/elsewhere" element={<h1>Elsewhere</h1>} />
      <Route path="/restaurants/choose/:id" element={<h1>Restaurant result route</h1>} />
    </Routes>
  </MemoryRouter></LocaleProvider>);
}

test("home starts nearby discovery with one primary action", async () => {
  renderHome();
  await screen.findByText(/\$25\.00/);
  expect(screen.getByRole("button", { name: "See what to eat" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Adjust" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Open offline demo" })).toBeVisible();
  expect(screen.queryByLabelText("Energy eaten today")).not.toBeInTheDocument();
  expect(screen.getByText(/breakfast|lunch|dinner/i)).toBeVisible();
});

test("primary action explains location before browser permission", async () => {
  renderHome();
  await screen.findByText(/\$25\.00/);
  fireEvent.click(screen.getByRole("button", { name: "See what to eat" }));
  expect(screen.getByRole("dialog", { name: "Use your location once?" })).toBeVisible();
});

test("keeps current location primary and opens landmark selection secondarily", async () => {
  renderHome();
  await screen.findByText(/\$25\.00/);
  expect(screen.getByRole("button", { name: "See what to eat" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Choose another place" }));
  expect(screen.getByRole("dialog", { name: "Choose a meeting place" })).toBeVisible();
});

test("starts from the confirmed POI without storing or logging the public landmark", async () => {
  renderHome();
  await screen.findByText(/\$25\.00/);
  fireEvent.click(screen.getByRole("button", { name: "Choose another place" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm fixture landmark" }));

  await waitFor(() => expect(startRestaurantRecommendation).toHaveBeenCalledWith(expect.objectContaining({
    point: { latitude: 24.5, longitude: 118.1 },
    locale: "en",
    profile: expect.objectContaining({ budget_minor: 2500, budget_is_explicit: false }),
  }), expect.objectContaining({ canCommit: expect.any(Function) })));
  expect(await dbApi.db.settings.get("selected_poi")).toBeUndefined();
  expect(await dbApi.db.privacyAccessEvents.count()).toBe(0);
  expect(localStorage).toHaveLength(0);
});

test("records current device location for AMap without storing coordinates", async () => {
  renderHome();
  await screen.findByText(/\$25\.00/);
  fireEvent.click(screen.getByRole("button", { name: "See what to eat" }));
  fireEvent.click(screen.getByRole("button", { name: "Allow once" }));

  await waitFor(() => expect(startRestaurantRecommendation).toHaveBeenCalled());
  const events = await dbApi.db.privacyAccessEvents.toArray();
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ category: "precise_location", recipient: "AMap" });
  expect(JSON.stringify(events[0])).not.toMatch(/24\.48|118\.09|latitude|longitude/);
});

test("serializes location and recommendation so conflicting journeys cannot start", async () => {
  const location = deferred<{ latitude: number; longitude: number; accuracy_m: number; source: string }>();
  const recommendation = deferred<string>();
  requestCurrentLocation.mockReturnValue(location.promise);
  startRestaurantRecommendation.mockReturnValue(recommendation.promise);
  renderHome();
  await screen.findByText(/\$25\.00/);

  fireEvent.click(screen.getByRole("button", { name: "See what to eat" }));
  fireEvent.click(screen.getByRole("button", { name: "Allow once" }));
  expect(screen.getByRole("button", { name: "Getting location..." })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Choose another place" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Adjust" })).toBeDisabled();
  expect(screen.getByRole("link", { name: "Open offline demo" })).toHaveAttribute("aria-disabled", "true");
  fireEvent.click(screen.getByRole("button", { name: "Choose another place" }));
  fireEvent.click(screen.getByRole("button", { name: "Adjust" }));
  fireEvent.click(screen.getByRole("link", { name: "Open offline demo" }));
  expect(screen.queryByRole("dialog", { name: "Choose a meeting place" })).not.toBeInTheDocument();
  expect(screen.queryByRole("dialog", { name: "Meal preferences" })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "What should I eat?" })).toBeVisible();
  expect(requestCurrentLocation).toHaveBeenCalledOnce();

  await act(async () => location.resolve({ latitude: 24.48, longitude: 118.09, accuracy_m: 20, source: "device" }));
  await waitFor(() => expect(startRestaurantRecommendation).toHaveBeenCalledOnce());
  expect(screen.getByRole("button", { name: "Choosing nearby..." })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Choose another place" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Choosing nearby..." }));
  expect(startRestaurantRecommendation).toHaveBeenCalledOnce();

  await act(async () => recommendation.resolve("session-serialized"));
});

test("ignores a deferred geolocation result after the journey unmounts", async () => {
  const location = deferred<{ latitude: number; longitude: number; accuracy_m: number; source: string }>();
  requestCurrentLocation.mockReturnValue(location.promise);
  renderRoutedHome();
  await screen.findByText(/\$25\.00/);
  fireEvent.click(screen.getByRole("button", { name: "See what to eat" }));
  fireEvent.click(screen.getByRole("button", { name: "Allow once" }));

  fireEvent.click(screen.getByRole("link", { name: "Leave journey" }));
  expect(screen.getByRole("heading", { name: "Elsewhere" })).toBeVisible();
  fireEvent.click(screen.getByRole("link", { name: "Return home" }));
  await screen.findByText(/\$25\.00/);
  fireEvent.click(screen.getByRole("button", { name: "Choose another place" }));
  await act(async () => location.resolve({ latitude: 24.48, longitude: 118.09, accuracy_m: 20, source: "device" }));

  expect(screen.getByRole("dialog", { name: "Choose a meeting place" })).toBeVisible();
  expect(startRestaurantRecommendation).not.toHaveBeenCalled();
  expect(await dbApi.db.privacyAccessEvents.count()).toBe(0);
});

test.each(["resolve", "reject"] as const)("ignores a deferred recommendation %s after a new picker opens", async (outcome) => {
  const recommendation = deferred<string>();
  startRestaurantRecommendation.mockReturnValue(recommendation.promise);
  renderRoutedHome();
  await screen.findByText(/\$25\.00/);
  fireEvent.click(screen.getByRole("button", { name: "See what to eat" }));
  fireEvent.click(screen.getByRole("button", { name: "Allow once" }));
  await waitFor(() => expect(startRestaurantRecommendation).toHaveBeenCalledOnce());

  fireEvent.click(screen.getByRole("link", { name: "Leave journey" }));
  expect(screen.getByRole("heading", { name: "Elsewhere" })).toBeVisible();
  fireEvent.click(screen.getByRole("link", { name: "Return home" }));
  await screen.findByText(/\$25\.00/);
  fireEvent.click(screen.getByRole("button", { name: "Choose another place" }));
  if (outcome === "resolve") await act(async () => recommendation.resolve("session-stale"));
  else await act(async () => recommendation.reject(new Error("stale failure")));

  expect(screen.getByRole("dialog", { name: "Choose a meeting place" })).toBeVisible();
  expect(screen.queryByRole("heading", { name: "Restaurant result route" })).not.toBeInTheDocument();
});

test("adjust saves a peanut exclusion without blocking one-tap use", async () => {
  renderHome();
  await screen.findByText(/\$25\.00/);
  fireEvent.click(screen.getByRole("button", { name: "Adjust" }));
  expect(screen.getByRole("dialog", { name: "Meal preferences" })).toBeVisible();
  fireEvent.click(screen.getByRole("checkbox", { name: "Peanuts" }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save" })); });

  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect((await dbApi.getProfile())?.excluded_allergens).toContain("peanuts");
  expect((await dbApi.getProfile())?.budget_is_explicit).toBe(false);
  expect(screen.getByRole("button", { name: "See what to eat" })).toBeVisible();
});

test.each([
  ["en", "$25.00", "Adjust", "Save"],
  ["zh-CN", "¥60.00", "调整", "保存"],
] as const)("keeps the %s default budget non-explicit when saved unchanged", async (locale, displayed, adjust, save) => {
  if (locale === "zh-CN") await dbApi.db.settings.put({ key: "locale.v2", value: locale });
  renderHome();
  await screen.findByText(displayed, { exact: false });
  fireEvent.click(screen.getByRole("button", { name: adjust }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: save })); });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect((await dbApi.getProfile())?.budget_is_explicit).toBe(false);
});

test("marks budget explicit only after the user edits its amount", async () => {
  renderHome();
  await screen.findByText("$25.00", { exact: false });
  fireEvent.click(screen.getByRole("button", { name: "Adjust" }));
  fireEvent.change(screen.getByLabelText("Usual maximum ($)"), { target: { value: "30" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save" })); });
  expect(await dbApi.getProfile()).toMatchObject({ budget_minor: 3000, budget_is_explicit: true });
});

test("preserves an already explicit budget when other settings are saved", async () => {
  await dbApi.saveProfile({
    locale: "en", excluded_allergens: [], excluded_ingredients: [], desired_taste_tags: [],
    preferred_cuisines: [],
    budget_minor: 7200, budget_is_explicit: true, duration_minutes: 20,
  });
  renderHome();
  await screen.findByText("$72.00", { exact: false });
  fireEvent.click(screen.getByRole("button", { name: "Adjust" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Peanuts" }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save" })); });
  expect(await dbApi.getProfile()).toMatchObject({ budget_minor: 7200, budget_is_explicit: true });
});

test("normalizes a legacy stored budget to non-explicit before recommending", async () => {
  await dbApi.db.settings.put({
    key: "profile.v2",
    value: {
      locale: "en",
      excluded_allergens: [],
      excluded_ingredients: [],
      desired_taste_tags: [],
      budget_minor: 2500,
      duration_minutes: 20,
    },
  });
  renderHome();
  await screen.findByText(/\$25\.00/);
  fireEvent.click(screen.getByRole("button", { name: "See what to eat" }));
  fireEvent.click(screen.getByRole("button", { name: "Allow once" }));

  await waitFor(() => expect(startRestaurantRecommendation).toHaveBeenCalled());
  expect(startRestaurantRecommendation).toHaveBeenCalledWith(expect.objectContaining({
    profile: expect.objectContaining({ budget_is_explicit: false }),
  }), expect.objectContaining({ canCommit: expect.any(Function) }));
});

test("ignores a stale profile load after the locale changes", async () => {
  let resolveFirst: (profile: UserProfile | null) => void = () => undefined;
  const firstLoad = new Promise<UserProfile | null>((resolve) => { resolveFirst = resolve; });
  const chineseProfile: UserProfile = {
    locale: "zh-CN",
    excluded_allergens: [],
    excluded_ingredients: [],
    desired_taste_tags: [],
    preferred_cuisines: [],
    budget_minor: 7200,
    budget_is_explicit: true,
    duration_minutes: 20,
  };
  const getProfile = vi.spyOn(dbApi, "getProfile")
    .mockReturnValueOnce(firstLoad)
    .mockResolvedValueOnce(chineseProfile);
  renderHome();
  fireEvent.click(screen.getByRole("button", { name: "Adjust" }));
  fireEvent.change(screen.getByLabelText("Language and currency"), { target: { value: "zh-CN" } });
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save" })); });

  await waitFor(() => expect(getProfile).toHaveBeenCalledTimes(2));
  await screen.findByText(/¥72\.00/);
  await act(async () => resolveFirst({ ...chineseProfile, locale: "en", budget_minor: 9900 }));

  expect(screen.getByText(/¥72\.00/)).toBeVisible();
  expect(screen.queryByText(/¥99\.00/)).not.toBeInTheDocument();
});

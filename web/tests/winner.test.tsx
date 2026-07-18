import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  createMemoryRouter,
  MemoryRouter,
  Route,
  RouterProvider,
  Routes,
  useLocation,
} from "react-router";
import catalog from "../public/data/catalog.v1.json";
import record from "../public/demo/day1.json";
import places from "../public/data/places.v1.json";
import rules from "../public/data/decision.v2.json";
import { db, resetLocalData, saveDecision, saveProfile } from "../src/db/db";
import { LocaleProvider } from "../src/i18n/locale";
import { defaultProfile } from "../src/recommendation/context";
import { startRecommendation } from "../src/recommendation/session";
import { parseDecisionSpec } from "../src/recommendation/spec";
import { WinnerPage } from "../src/winner/WinnerPage";
import { NOW } from "./support/recommendation-fixtures";

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="location">{location.pathname + location.search}</output>;
}

test("winner exposes one dish, bounded estimates, provenance, and one reserve", async () => {
  await resetLocalData();
  await saveDecision({ id: record.decision.decision_id, stateId: "day1", payload: record });
  const router = createMemoryRouter(
    [{ path: "/winner/:decisionId", element: <WinnerPage /> }],
    { initialEntries: [`/winner/${record.decision.decision_id}`] },
  );
  await act(async () => { render(<LocaleProvider><RouterProvider router={router} /></LocaleProvider>); });
  expect(await screen.findByRole("heading", { name: record.winner.dish.name })).toBeVisible();
  expect(screen.getByText("Fictional demo menu")).toBeVisible();
  expect(screen.getByText("Nutrition estimate")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Not today" }));
  expect(screen.getAllByRole("button", { name: /heavy|craving|expensive|recently/i })).toHaveLength(4);
  fireEvent.click(screen.getByRole("button", { name: "Not craving it" }));
  expect(await screen.findByText("Your one reserve")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Not today" })).not.toBeInTheDocument();
});

test("live winner can pick another or edit preferences", async () => {
  await resetLocalData();
  const spec = parseDecisionSpec(rules);
  await saveProfile(defaultProfile("en", spec));
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    const body = url.endsWith("decision.v2.json")
      ? rules
      : url.endsWith("catalog.v1.json")
        ? catalog
        : places;
    return new Response(JSON.stringify(body));
  });
  const first = await startRecommendation({ quickState: null, now: NOW });
  await act(async () => { render(
    <LocaleProvider><MemoryRouter initialEntries={[`/winner/${first.decision.decision_id}`]}>
      <LocationProbe />
      <Routes>
        <Route path="/winner/:decisionId" element={<WinnerPage />} />
        <Route path="/" element={<p>Preferences</p>} />
      </Routes>
    </MemoryRouter></LocaleProvider>,
  ); });

  expect(await screen.findByRole("heading", { name: first.winner.dish.name })).toBeVisible();
  expect(screen.getAllByRole("listitem", { name: /reason/i })).toHaveLength(3);
  expect(screen.getByRole("button", { name: "Find nearby" })).toBeVisible();
  expect(screen.queryByText("Fictional demo menu")).not.toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Pick another" })); });
  await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).not.toHaveTextContent(first.winner.dish.name));
  fireEvent.click(screen.getByRole("button", { name: "Edit preferences" }));
  expect(screen.getByLabelText("location")).toHaveTextContent("/?adjust=1");
  fetchMock.mockRestore();
});

test("winner localizes interface copy but preserves source dish and restaurant names", async () => {
  await resetLocalData();
  await db.settings.put({ key: "locale.v2", value: "zh-CN" });
  await saveDecision({ id: record.decision.decision_id, stateId: "day1", payload: record });
  const router = createMemoryRouter(
    [{ path: "/winner/:decisionId", element: <WinnerPage /> }],
    { initialEntries: [`/winner/${record.decision.decision_id}`] },
  );
  await act(async () => { render(<LocaleProvider><RouterProvider router={router} /></LocaleProvider>); });
  expect(await screen.findByRole("heading", { name: record.winner.dish.name })).toBeVisible();
  expect(screen.getByText(record.winner.place.name)).toBeVisible();
  expect(await screen.findByRole("button", { name: "今天不想吃" })).toBeVisible();
});

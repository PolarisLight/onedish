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
import { resetLocalData, saveDecision, saveProfile } from "../src/db/db";
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
  await act(async () => { render(<RouterProvider router={router} />); });
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
    <MemoryRouter initialEntries={[`/winner/${first.decision.decision_id}`]}>
      <LocationProbe />
      <Routes>
        <Route path="/winner/:decisionId" element={<WinnerPage />} />
        <Route path="/" element={<p>Preferences</p>} />
      </Routes>
    </MemoryRouter>,
  ); });

  expect(await screen.findByRole("heading", { name: first.winner.dish.name })).toBeVisible();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Pick another" })); });
  await waitFor(() => expect(screen.getByRole("heading")).not.toHaveTextContent(first.winner.dish.name));
  fireEvent.click(screen.getByRole("button", { name: "Edit preferences" }));
  expect(screen.getByLabelText("location")).toHaveTextContent("/?adjust=1");
  fetchMock.mockRestore();
});

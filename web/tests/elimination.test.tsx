import { act, fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import catalog from "../public/data/catalog.v1.json";
import places from "../public/data/places.v1.json";
import record from "../public/demo/day1.json";
import { db, saveDecision, resetLocalData } from "../src/db/db";
import { EliminationPage } from "../src/elimination/EliminationPage";
import { LocaleProvider } from "../src/i18n/locale";

async function renderDecision(locale: "en" | "zh-CN" = "en") {
  await resetLocalData();
  await db.settings.put({ key: "locale.v2", value: locale });
  await saveDecision({ id: record.decision.decision_id, stateId: "day1", payload: record });
  const router = createMemoryRouter(
    [
      { path: "/choose/:decisionId", element: <EliminationPage /> },
      { path: "/winner/:decisionId", element: <p>Winner</p> },
      { path: "/", element: <p>Home</p> },
    ],
    { initialEntries: [`/choose/${record.decision.decision_id}`] },
  );
  await act(async () => { render(<LocaleProvider><RouterProvider router={router} /></LocaleProvider>); });
}

test("elimination can finish inside one viewport", async () => {
  await renderDecision();
  expect(await screen.findByRole("heading", { name: "From ninety to one." })).toBeVisible();
  expect(screen.getByRole("region", { name: "Decision actions" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Skip" }));
  expect(screen.getByRole("button", { name: "Meet your dish" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Skip" })).not.toBeInTheDocument();
});

test("missing stored decision has a start-over recovery", async () => {
  await resetLocalData();
  const router = createMemoryRouter([{ path: "/choose/:decisionId", element: <EliminationPage /> }, { path: "/", element: <p>Home</p> }], { initialEntries: ["/choose/missing"] });
  await act(async () => { render(<LocaleProvider><RouterProvider router={router} /></LocaleProvider>); });
  expect(await screen.findByRole("heading", { name: "Decision unavailable" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Start again" })).toBeVisible();
});

test("elimination follows the active Chinese interface locale", async () => {
  await renderDecision("zh-CN");
  expect(await screen.findByRole("heading", { name: "从九十到唯一。" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "跳过" }));
  expect(screen.getByRole("button", { name: "看看你的餐食" })).toBeVisible();
});

test("elimination localizes available candidate dish names", async () => {
  await resetLocalData();
  await db.settings.put({ key: "locale.v2", value: "zh-CN" });
  const removedId = record.decision.stages.at(-1)!.representative_removed_ids[0];
  const removedDish = catalog.dishes.find((dish) => dish.id === removedId)!;
  const removedPlace = places.places.find(
    (place) => place.id === `fixture-${removedDish.restaurant_id}`,
  )!;
  const liveRecord = {
    ...record,
    schema_version: "recommendation.v2",
    locale: "zh-CN",
    input: { session_exclusions: [] },
    ranked_candidates: [record.winner, { dish: removedDish, place: removedPlace }],
    winner_reason_codes: [],
    session_exclusions: [],
  };
  await saveDecision({ id: record.decision.decision_id, stateId: "recommendation.v2", payload: liveRecord });
  const router = createMemoryRouter(
    [{ path: "/choose/:decisionId", element: <EliminationPage /> }],
    { initialEntries: [`/choose/${record.decision.decision_id}`] },
  );
  await act(async () => {
    render(<LocaleProvider><RouterProvider router={router} /></LocaleProvider>);
  });
  fireEvent.click(await screen.findByRole("button", { name: "跳过" }));
  expect(await screen.findByText(removedDish.translations["zh-CN"].name)).toBeVisible();
  expect(screen.queryByText(removedDish.name)).not.toBeInTheDocument();
});

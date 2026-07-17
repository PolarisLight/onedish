import { act, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import record from "../public/demo/day1.json";
import { saveDecision, resetLocalData } from "../src/db/db";
import { EliminationPage } from "../src/elimination/EliminationPage";

test("elimination uses persisted, non-increasing stage counts", async () => {
  await resetLocalData();
  await saveDecision({ id: record.decision.decision_id, stateId: "day1", payload: record });
  const router = createMemoryRouter(
    [{ path: "/choose/:decisionId", element: <EliminationPage /> }],
    { initialEntries: [`/choose/${record.decision.decision_id}`] },
  );
  await act(async () => { render(<RouterProvider router={router} />); });
  expect(await screen.findByText("From ninety to one.")).toBeVisible();
  expect(screen.getByText("Nearby menu set")).toBeVisible();
  expect(screen.getAllByText("90").length).toBeGreaterThan(0);
  expect(screen.getByRole("button", { name: "Show result" })).toBeVisible();
});

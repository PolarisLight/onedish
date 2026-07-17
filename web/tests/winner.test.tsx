import { act, fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import record from "../public/demo/day1.json";
import { resetLocalData, saveDecision } from "../src/db/db";
import { WinnerPage } from "../src/winner/WinnerPage";

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

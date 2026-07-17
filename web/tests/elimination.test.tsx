import { act, fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import record from "../public/demo/day1.json";
import { saveDecision, resetLocalData } from "../src/db/db";
import { EliminationPage } from "../src/elimination/EliminationPage";

async function renderDecision() {
  await resetLocalData();
  await saveDecision({ id: record.decision.decision_id, stateId: "day1", payload: record });
  const router = createMemoryRouter(
    [
      { path: "/choose/:decisionId", element: <EliminationPage /> },
      { path: "/winner/:decisionId", element: <p>Winner</p> },
      { path: "/", element: <p>Home</p> },
    ],
    { initialEntries: [`/choose/${record.decision.decision_id}`] },
  );
  await act(async () => { render(<RouterProvider router={router} />); });
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
  await act(async () => { render(<RouterProvider router={router} />); });
  expect(await screen.findByRole("heading", { name: "Decision unavailable" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Start again" })).toBeVisible();
});

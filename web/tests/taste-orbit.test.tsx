import { render, screen } from "@testing-library/react";
import { TasteOrbitPage } from "../src/history/TasteOrbitPage";

test("taste orbit provides deterministic visual and textual clusters", async () => {
  render(<TasteOrbitPage />);
  expect(screen.getByRole("img", { name: /taste clusters/i })).toBeVisible();
  expect(await screen.findByText("strongest recent signal")).toBeVisible();
  expect(screen.getByText("Text summary of taste clusters")).toBeVisible();
  expect(screen.getAllByLabelText(/recent signals/i).length).toBeGreaterThan(0);
});

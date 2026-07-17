import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { HomePage } from "../src/home/HomePage";

test("home gives demo and personal context equal clarity", () => {
  render(<MemoryRouter><HomePage /></MemoryRouter>);
  expect(screen.getByRole("heading", { name: /stop browsing/i })).toBeVisible();
  expect(screen.getByRole("button", { name: "Try the demo" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Use my context" })).toBeVisible();
  expect(screen.getByLabelText("Energy eaten today")).not.toBeRequired();
  expect(screen.getByText(/uncertain allergen matches/i)).toBeInTheDocument();
  expect(screen.queryByText(/Apple Health/i)).not.toBeInTheDocument();
});

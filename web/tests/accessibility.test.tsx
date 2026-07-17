import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { Layout } from "../src/shared/Layout";

test("navigation has a name and keyboard-visible links", () => {
  render(<MemoryRouter><Layout /></MemoryRouter>);
  const navigation = screen.getByRole("navigation", { name: "Main navigation" });
  expect(navigation).toBeInTheDocument();
  expect(within(navigation).getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
});

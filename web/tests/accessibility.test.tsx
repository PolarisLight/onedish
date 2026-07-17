import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { Layout } from "../src/shared/Layout";

test("navigation has a name and keyboard-visible links", () => {
  render(<MemoryRouter><Layout /></MemoryRouter>);
  expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
});

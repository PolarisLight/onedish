import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { Layout } from "../src/shared/Layout";
import { LocaleProvider } from "../src/i18n/locale";

test("navigation has a name and keyboard-visible links", () => {
  render(<LocaleProvider><MemoryRouter><Layout /></MemoryRouter></LocaleProvider>);
  const navigation = screen.getByRole("navigation", { name: "Main navigation" });
  expect(navigation).toBeInTheDocument();
  expect(within(navigation).getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
});

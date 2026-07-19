import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, expect, it } from "vitest";
import { LocaleProvider } from "../src/i18n/locale";
import { RestaurantEliminationPage } from "../src/restaurants/RestaurantEliminationPage";
import { parseRestaurantRecommendation } from "../src/restaurants/parser";
import { clearRestaurantSessions, createRestaurantSession } from "../src/restaurants/session-store";
import { restaurantResponse } from "./support/restaurant-fixtures";

beforeEach(clearRestaurantSessions);

it("starts with the real nearby candidate count", () => {
  const id = createRestaurantSession(parseRestaurantRecommendation(restaurantResponse()));
  render(<LocaleProvider><MemoryRouter initialEntries={[`/restaurants/choose/${id}`]}><Routes><Route path="/restaurants/choose/:sessionId" element={<RestaurantEliminationPage />} /></Routes></MemoryRouter></LocaleProvider>);
  expect(screen.getAllByText("8")[0]).toBeVisible();
  expect(screen.queryByText("99")).not.toBeInTheDocument();
});

it("recovers when the memory-only session is gone", () => {
  render(<LocaleProvider><MemoryRouter initialEntries={["/restaurants/choose/missing"]}><Routes><Route path="/restaurants/choose/:sessionId" element={<RestaurantEliminationPage />} /></Routes></MemoryRouter></LocaleProvider>);
  expect(screen.getByRole("button", { name: "Start again" })).toBeVisible();
});

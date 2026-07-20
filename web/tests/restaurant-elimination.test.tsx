import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, expect, it } from "vitest";
import { LocaleProvider } from "../src/i18n/locale";
import { RestaurantEliminationPage } from "../src/restaurants/RestaurantEliminationPage";
import { parseRestaurantRecommendation } from "../src/restaurants/parser";
import {
  clearRestaurantSessions,
  createRestaurantSession,
} from "../src/restaurants/session-store";
import { restaurantRequest, restaurantResponse } from "./support/restaurant-fixtures";


beforeEach(clearRestaurantSessions);

function renderElimination() {
  const id = createRestaurantSession(
    restaurantRequest(),
    parseRestaurantRecommendation(restaurantResponse()),
  );
  render(
    <LocaleProvider>
      <MemoryRouter initialEntries={[`/restaurants/choose/${id}`]}>
        <Routes>
          <Route
            path="/restaurants/choose/:sessionId"
            element={<RestaurantEliminationPage />}
          />
        </Routes>
      </MemoryRouter>
    </LocaleProvider>,
  );
}

it("starts with the first real search round rather than a fabricated count", () => {
  renderElimination();
  expect(screen.getByText("Searched within 2 km · 3 places returned")).toBeVisible();
  expect(screen.getAllByText("3")[0]).toBeVisible();
  expect(screen.queryByText("99")).not.toBeInTheDocument();
});

it("ends on the actual quality-pool count without a fake habits stage", () => {
  renderElimination();
  fireEvent.click(screen.getByRole("button", { name: "Skip" }));
  expect(screen.getByText("2 strong options entered the final draw")).toBeVisible();
  expect(screen.queryByText(/recent choices/i)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Meet your restaurant" })).toBeVisible();
});

it("recovers when the memory-only session is gone", () => {
  render(
    <LocaleProvider>
      <MemoryRouter initialEntries={["/restaurants/choose/missing"]}>
        <Routes>
          <Route
            path="/restaurants/choose/:sessionId"
            element={<RestaurantEliminationPage />}
          />
        </Routes>
      </MemoryRouter>
    </LocaleProvider>,
  );
  expect(screen.getByRole("button", { name: "Start again" })).toBeVisible();
});

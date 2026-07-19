import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "../src/db/db";
import { LocaleProvider } from "../src/i18n/locale";
import { RestaurantWinnerPage } from "../src/restaurants/RestaurantWinnerPage";
import { parseRestaurantRecommendation } from "../src/restaurants/parser";
import { clearRestaurantSessions, createRestaurantSession } from "../src/restaurants/session-store";
import { restaurantResponse } from "./support/restaurant-fixtures";

beforeEach(async () => {
  clearRestaurantSessions();
  await db.settings.delete("locale.v2");
});
afterEach(() => vi.restoreAllMocks());

function renderWinner(response = restaurantResponse()) {
  const id = createRestaurantSession(parseRestaurantRecommendation(response));
  render(<LocaleProvider><MemoryRouter initialEntries={[`/restaurants/winner/${id}`]}><Routes><Route path="/restaurants/winner/:sessionId" element={<RestaurantWinnerPage />} /></Routes></MemoryRouter></LocaleProvider>);
}

it("binds evidence to the current candidate while rotating without fetch", () => {
  const response = restaurantResponse();
  response.ranked[0]!.reason_codes = ["higher_rating"];
  response.ranked[1]!.reason_codes = ["closer_than_typical"];
  const fetchSpy = vi.spyOn(window, "fetch");
  renderWinner(response);
  expect(screen.getByRole("heading", { name: "First" })).toBeVisible();
  expect(screen.getByText("CN¥50.00")).toBeVisible();
  expect(screen.getByText("Higher rated than most nearby options")).toBeVisible();
  expect(screen.queryByText("Closer than the typical option in this search")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Pick another" }));
  expect(screen.getByRole("heading", { name: "Second" })).toBeVisible();
  expect(screen.getByText("Closer than the typical option in this search")).toBeVisible();
  expect(screen.queryByText("Higher rated than most nearby options")).not.toBeInTheDocument();
  expect(fetchSpy).not.toHaveBeenCalled();
});

it("formats a CNY candidate in an English interface without guessing USD", () => {
  renderWinner();

  expect(screen.getByText("CN¥50.00")).toBeVisible();
  expect(screen.queryByText("$50.00")).not.toBeInTheDocument();
});

it("formats a USD candidate in a Chinese interface without guessing CNY", async () => {
  const response = restaurantResponse();
  response.ranked[0]!.candidate.currency = "USD";
  await db.settings.put({ key: "locale.v2", value: "zh-CN" });
  renderWinner(response);

  expect(await screen.findByText("US$50.00")).toBeVisible();
  expect(screen.queryByText("¥50.00")).not.toBeInTheDocument();
});

it("suppresses average cost when the candidate has no currency", () => {
  const response = restaurantResponse();
  Object.assign(response.ranked[0]!.candidate, { currency: null });
  renderWinner(response);

  expect(screen.queryByText("average per person")).not.toBeInTheDocument();
  expect(screen.queryByText(/50\.00/)).not.toBeInTheDocument();
});

it("politely announces the current restaurant after in-memory rotation", () => {
  const fetchSpy = vi.spyOn(window, "fetch");
  renderWinner();
  const announcement = document.querySelector('[aria-live="polite"]');

  expect(announcement).toHaveTextContent("First");
  fireEvent.click(screen.getByRole("button", { name: "Pick another" }));
  expect(announcement).toHaveTextContent("Second");
  expect(fetchSpy).not.toHaveBeenCalled();
});

it("describes exploration without unsupported personalization claims", () => {
  const response = restaurantResponse();
  response.ranked[0]!.reason_codes = ["higher_rating"];
  renderWinner(response);

  expect(screen.getByText("Selected from real nearby place data")).toBeVisible();
  expect(screen.queryByText(/your taste/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/recent choices/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/usual budget/i)).not.toBeInTheDocument();
});

it("labels personalized recommendations without inventing reasons", () => {
  const response = restaurantResponse();
  response.recommendation_mode = "personalized";
  response.ranked[0]!.reason_codes = ["high_confidence"];
  renderWinner(response);

  expect(screen.getByText("Personalized using the preferences you provided")).toBeVisible();
  expect(screen.getByText("Backed by more complete place data")).toBeVisible();
  expect(screen.queryByText("Matches a taste you selected")).not.toBeInTheDocument();
  expect(screen.queryByText("Different from your recent choices")).not.toBeInTheDocument();
});

it("styles the navigation anchor as a link button", () => {
  renderWinner();

  expect(screen.getByRole("link", { name: "Go here" })).toHaveClass("primary-button", "action-link-button");
});

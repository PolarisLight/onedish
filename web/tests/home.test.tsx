import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { getProfile, resetLocalData } from "../src/db/db";
import { HomePage } from "../src/home/HomePage";
import { LocaleProvider } from "../src/i18n/locale";

beforeEach(() => resetLocalData());

function renderHome() {
  return render(
    <LocaleProvider>
      <MemoryRouter><HomePage /></MemoryRouter>
    </LocaleProvider>,
  );
}

test("home recommends with one primary action and optional adjustment", () => {
  renderHome();
  expect(screen.getByRole("button", { name: "Pick my meal" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Adjust" })).toBeVisible();
  expect(screen.queryByLabelText("Energy eaten today")).not.toBeInTheDocument();
  expect(screen.getByText(/breakfast|lunch|dinner/i)).toBeVisible();
});

test("adjust saves a peanut exclusion without blocking one-tap use", async () => {
  renderHome();
  fireEvent.click(screen.getByRole("button", { name: "Adjust" }));
  expect(screen.getByRole("dialog", { name: "Meal preferences" })).toBeVisible();
  fireEvent.click(screen.getByRole("checkbox", { name: "Peanuts" }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save" })); });

  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect((await getProfile())?.excluded_allergens).toContain("peanuts");
  expect(screen.getByRole("button", { name: "Pick my meal" })).toBeVisible();
});

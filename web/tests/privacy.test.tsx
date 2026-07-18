import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { db, resetLocalData } from "../src/db/db";
import { LocaleProvider } from "../src/i18n/locale";
import { PrivacyPage } from "../src/privacy/PrivacyPage";

beforeEach(() => resetLocalData());

async function renderPrivacy() {
  await act(async () => { render(<LocaleProvider><PrivacyPage /></LocaleProvider>); });
}

test("explains all protected categories and marks sync as future capability", async () => {
  await renderPrivacy();
  expect(screen.getByRole("heading", { name: "Your body is not the product." })).toBeVisible();
  for (const name of ["Precise location", "Health signals", "Meal history", "Taste profile", "Identity and device identifiers"]) {
    expect(await screen.findByRole("button", { name })).toBeVisible();
  }
  fireEvent.click(screen.getByRole("button", { name: "Precise location" }));
  expect(screen.getAllByText("OpenStreetMap")).toHaveLength(2);
  expect(screen.getByText("Cloud sync is off. Your data stays on this device.")).toBeVisible();
  expect(screen.getByRole("checkbox", { name: "Allow location requests" })).toBeChecked();
});

test("requires confirmation before deleting local profile data", async () => {
  await db.settings.put({ key: "profile.v2", value: { local: true } });
  await renderPrivacy();
  fireEvent.click(await screen.findByRole("button", { name: "Delete local profile" }));
  expect(screen.getByRole("dialog", { name: "Delete local profile and meal-derived data?" })).toBeVisible();
  expect(await db.settings.get("profile.v2")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  await waitFor(async () => expect(await db.settings.get("profile.v2")).toBeUndefined());
});

test("connects only the selected category and reserves the external receiver for location", async () => {
  await renderPrivacy();
  fireEvent.click(await screen.findByRole("button", { name: "Health signals" }));
  expect(screen.getByTestId("privacy-selected-connector")).toHaveAttribute(
    "data-target",
    "health_signals",
  );
  expect(screen.queryByTestId("privacy-outbound-connector")).not.toBeInTheDocument();
  expect(screen.queryByText("OpenStreetMap")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Precise location" }));
  expect(screen.getByTestId("privacy-outbound-connector")).toBeVisible();
  expect(screen.getByTestId("privacy-receiver")).toHaveTextContent("OpenStreetMap");
});

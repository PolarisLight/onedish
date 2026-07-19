import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DailyContextForm } from "../src/context/DailyContextForm";
import { db, resetLocalData } from "../src/db/db";
import { LocaleProvider } from "../src/i18n/locale";

test("renders duration options entirely in the active Chinese locale", async () => {
  await resetLocalData();
  await db.settings.put({ key: "locale.v2", value: "zh-CN" });
  await act(async () => { render(<LocaleProvider><DailyContextForm initialProfile={{ locale: "zh-CN", excluded_allergens: [], excluded_ingredients: [], desired_taste_tags: [], preferred_cuisines: [], budget_minor: 6000, budget_is_explicit: false, duration_minutes: 20 }} onSubmit={vi.fn()} onCancel={vi.fn()} /></LocaleProvider>); });
  expect(await screen.findByRole("option", { name: "20 分钟" })).toBeVisible();
  expect(screen.queryByText("20 min")).not.toBeInTheDocument();
  for (const cuisine of ["闽菜", "川菜", "粤菜", "日本料理", "西餐"]) {
    expect(screen.getByRole("checkbox", { name: cuisine })).toBeVisible();
  }
});

test("submits explicit restaurant cuisines separately from taste signals", async () => {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(<LocaleProvider><DailyContextForm initialProfile={{
    locale: "en", excluded_allergens: [], excluded_ingredients: [], desired_taste_tags: ["spicy"],
    preferred_cuisines: [], budget_minor: 2500, budget_is_explicit: false, duration_minutes: 20,
  }} onSubmit={onSubmit} onCancel={vi.fn()} /></LocaleProvider>);

  fireEvent.click(screen.getByRole("checkbox", { name: "Fujian" }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
    desired_taste_tags: ["spicy"],
    preferred_cuisines: ["fujian"],
  })));
});

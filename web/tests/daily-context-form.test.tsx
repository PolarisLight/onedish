import { act, render, screen } from "@testing-library/react";
import { DailyContextForm } from "../src/context/DailyContextForm";
import { db, resetLocalData } from "../src/db/db";
import { LocaleProvider } from "../src/i18n/locale";

test("renders duration options entirely in the active Chinese locale", async () => {
  await resetLocalData();
  await db.settings.put({ key: "locale.v2", value: "zh-CN" });
  await act(async () => { render(<LocaleProvider><DailyContextForm initialProfile={{ locale: "zh-CN", excluded_allergens: [], excluded_ingredients: [], desired_taste_tags: [], budget_minor: 6000, duration_minutes: 20 }} onSubmit={vi.fn()} onCancel={vi.fn()} /></LocaleProvider>); });
  expect(await screen.findByRole("option", { name: "20 分钟" })).toBeVisible();
  expect(screen.queryByText("20 min")).not.toBeInTheDocument();
});

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { db, resetLocalData } from "../src/db/db";
import { LocaleProvider } from "../src/i18n/locale";
import { RestaurantPreferenceForm } from "../src/restaurants/RestaurantPreferenceForm";
import { restaurantPreferenceDefaults } from "../src/restaurants/preferences";


beforeEach(() => resetLocalData());

test("renders a compact Chinese shortcut set and expands the complete taxonomy", async () => {
  await db.settings.put({ key: "locale.v2", value: "zh-CN" });
  await act(async () => {
    render(
      <LocaleProvider>
        <RestaurantPreferenceForm
          initialPreferences={restaurantPreferenceDefaults("zh-CN")}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />
      </LocaleProvider>,
    );
  });

  expect(await screen.findByRole("checkbox", { name: "日本料理" })).toBeVisible();
  expect(screen.getByRole("checkbox", { name: "火锅" })).toBeVisible();
  expect(screen.queryByRole("checkbox", { name: "韩国料理" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "更多选择" }));
  expect(screen.getByRole("checkbox", { name: "韩国料理" })).toBeVisible();
  expect(screen.getByRole("group", { name: "国际风味" })).toBeVisible();
  expect(screen.queryByText("绝不包含")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("可用时间")).not.toBeInTheDocument();
});

test("submits multiple selected tags with OR-shaped preferences", async () => {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(
    <LocaleProvider>
      <RestaurantPreferenceForm
        initialPreferences={restaurantPreferenceDefaults("en")}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />
    </LocaleProvider>,
  );
  fireEvent.click(screen.getByRole("checkbox", { name: "Japanese" }));
  fireEvent.click(screen.getByRole("checkbox", { name: "Hot pot" }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({
    selected_tags: ["japanese", "hot_pot"],
    budget_minor: 2500,
    budget_is_explicit: false,
  }));
});

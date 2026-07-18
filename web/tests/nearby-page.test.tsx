import { act, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import record from "../public/demo/day1.json";
import { db, resetLocalData, saveDecision } from "../src/db/db";
import { LocaleProvider } from "../src/i18n/locale";
import { NearbyPage } from "../src/nearby/NearbyPage";

test("nearby localizes interface copy and preserves the source dish name", async () => {
  await resetLocalData();
  await db.settings.put({ key: "locale.v2", value: "zh-CN" });
  await saveDecision({ id: record.decision.decision_id, stateId: "day1", payload: record });
  const router = createMemoryRouter(
    [{ path: "/nearby/:decisionId", element: <NearbyPage /> }],
    { initialEntries: [`/nearby/${record.decision.decision_id}`] },
  );
  await act(async () => { render(<LocaleProvider><RouterProvider router={router} /></LocaleProvider>); });
  expect(await screen.findByRole("heading", { name: "去附近找到它。" })).toBeVisible();
  expect(screen.getByText(record.winner.dish.name, { exact: false })).toBeVisible();
  expect(screen.getByRole("button", { name: "使用当前位置" })).toBeVisible();
});

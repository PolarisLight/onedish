import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { resetLocalData, db } from "../src/db/db";
import { LocaleSwitch } from "../src/i18n/LocaleSwitch";
import { LocaleProvider, useLocale } from "../src/i18n/locale";
import { Layout } from "../src/shared/Layout";
import { HomePage } from "../src/home/HomePage";
import { MemoryRouter } from "react-router";

beforeEach(async () => {
  await resetLocalData();
  document.documentElement.lang = "en";
});

function LocaleProbe() {
  const { locale, setLocale, t } = useLocale();
  return <>
    <span>{locale}</span>
    <span>{t("nav.privacy")}</span>
    <button onClick={() => void setLocale("zh-CN")}>change</button>
  </>;
}

test("restores English document semantics when the lang attribute is missing", async () => {
  document.documentElement.removeAttribute("lang");

  render(<LocaleProvider><LocaleProbe /></LocaleProvider>);

  await waitFor(() => expect(document.documentElement.lang).toBe("en"));
  expect(screen.getByText("Privacy")).toBeVisible();
});

test("switches catalog copy, persists locale, and updates document language", async () => {
  render(<LocaleProvider><LocaleProbe /></LocaleProvider>);
  fireEvent.click(screen.getByRole("button", { name: "change" }));
  await waitFor(() => expect(screen.getByText("隐私")).toBeVisible());
  expect(document.documentElement.lang).toBe("zh-CN");
  expect((await db.settings.get("locale.v2"))?.value).toBe("zh-CN");
});

test("locale switch exposes two explicit pressed states", async () => {
  render(<LocaleProvider><LocaleSwitch /></LocaleProvider>);
  expect(screen.getByRole("button", { name: "中文" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByRole("button", { name: "EN" })).toHaveAttribute("aria-pressed", "true");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "中文" })); });
  expect(screen.getByRole("button", { name: "中文" })).toHaveAttribute("aria-pressed", "true");
});

test("switches shell navigation without hiding the language control", async () => {
  render(<LocaleProvider><MemoryRouter><Layout /></MemoryRouter></LocaleProvider>);
  fireEvent.click(screen.getByRole("button", { name: "中文" }));
  const desktopNav = await screen.findByRole("navigation", { name: "主导航" });
  expect(within(desktopNav).getByRole("link", { name: "隐私" })).toBeVisible();
  const mobileNav = screen.getByRole("navigation", { name: "移动端导航" });
  expect(within(mobileNav).getByRole("link", { name: "今天" })).toHaveAttribute("href", "/");
  expect(within(mobileNav).getByRole("link", { name: "口味轨道" })).toHaveAttribute("href", "/history");
  expect(screen.getByRole("button", { name: "EN" })).toBeVisible();
});

test("switches home and profile interface copy to Chinese", async () => {
  render(<LocaleProvider><MemoryRouter><LocaleSwitch /><HomePage /></MemoryRouter></LocaleProvider>);
  fireEvent.click(screen.getByRole("button", { name: "中文" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "帮我选一餐" })).toBeVisible());
  fireEvent.click(screen.getByRole("button", { name: "调整" }));
  expect(screen.getByRole("dialog", { name: "用餐偏好" })).toBeVisible();
  expect(screen.getByRole("checkbox", { name: "花生" })).toBeVisible();
});

import {
  formatDistance,
  formatMoney,
  localizedPriceMinor,
  normalizeLocale,
} from "../src/i18n/locale-utils";
import { spec } from "./support/recommendation-fixtures";


test("normalizes browser language to the two supported locales", () => {
  expect(normalizeLocale("zh-CN")).toBe("zh-CN");
  expect(normalizeLocale("zh-Hans-SG")).toBe("zh-CN");
  expect(normalizeLocale("en-GB")).toBe("en");
  expect(normalizeLocale("fr-FR")).toBe("en");
});


test("formats converted prices and locale distance units", () => {
  expect(localizedPriceMinor(2500, "en", spec)).toBe(2500);
  expect(localizedPriceMinor(2500, "zh-CN", spec)).toBe(18000);
  expect(formatMoney(2500, "en")).toContain("25.00");
  expect(formatMoney(6000, "zh-CN")).toContain("60.00");
  expect(formatDistance(1609, "en")).toContain("mi");
  expect(formatDistance(1609, "zh-CN")).toContain("公里");
});

test("formats an explicit currency independently from the interface locale", () => {
  expect(formatMoney(5000, "en", "CNY")).toBe("CN¥50.00");
  expect(formatMoney(5000, "zh-CN", "USD")).toBe("US$50.00");
});

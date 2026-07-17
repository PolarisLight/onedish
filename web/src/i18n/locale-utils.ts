import type { DecisionSpec, SupportedLocale } from "../recommendation/types";

export function normalizeLocale(language: string): SupportedLocale {
  return language.toLocaleLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

export function localizedPriceMinor(
  usdMinor: number,
  locale: SupportedLocale,
  spec: DecisionSpec,
): number {
  return Math.round(usdMinor * spec.locales[locale].usd_multiplier);
}

export function formatMoney(minor: number, locale: SupportedLocale): string {
  return new Intl.NumberFormat(locale === "en" ? "en-US" : "zh-CN", {
    style: "currency",
    currency: locale === "en" ? "USD" : "CNY",
    minimumFractionDigits: 2,
  }).format(minor / 100);
}

export function formatDistance(meters: number, locale: SupportedLocale): string {
  if (locale === "en") {
    return new Intl.NumberFormat("en-US", {
      style: "unit",
      unit: "mile",
      unitDisplay: "short",
      maximumFractionDigits: 1,
    }).format(meters / 1609.344);
  }
  return new Intl.NumberFormat("zh-CN", {
    style: "unit",
    unit: "kilometer",
    unitDisplay: "long",
    maximumFractionDigits: 1,
  }).format(meters / 1000);
}

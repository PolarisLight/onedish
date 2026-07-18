import type { Dish } from "../domain/contracts";
import type { SupportedLocale } from "../recommendation/types";

import type { MessageKey } from "./messages";

const knownTags = new Set([
  "american",
  "asian",
  "indian",
  "latin",
  "mediterranean",
  "middle-eastern",
  "mixed",
  "cold",
  "comforting",
  "crisp",
  "filling",
  "fresh",
  "light",
  "mild",
  "rich",
  "spicy",
  "warm",
]);

export function localizeDish(dish: Dish, locale: SupportedLocale) {
  const translated = locale === "zh-CN" ? dish.translations?.["zh-CN"] : undefined;
  return {
    name: translated?.name.trim() || dish.name,
    description: translated?.description.trim() || dish.description,
  };
}

export function tagMessageKey(tag: string): MessageKey | null {
  return knownTags.has(tag) ? (`tag.${tag}` as MessageKey) : null;
}

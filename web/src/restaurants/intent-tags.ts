import type { SupportedLocale } from "../recommendation/types";


export const RESTAURANT_INTENT_TAGS = [
  "minnan_fujian",
  "sichuan_hunan",
  "cantonese_dim_sum",
  "jiangzhe",
  "northeastern",
  "yunnan_guizhou",
  "northwestern_xinjiang",
  "home_style",
  "vegetarian",
  "japanese",
  "korean",
  "western",
  "southeast_asian",
  "indian",
  "middle_eastern",
  "hot_pot",
  "barbecue",
  "seafood",
  "noodles",
  "dry_pot_grilled_fish",
  "snacks_fast_food",
  "buffet",
  "coffee",
  "bakery_dessert",
  "drinks",
] as const;

export type RestaurantIntentTag = typeof RESTAURANT_INTENT_TAGS[number];
export type RestaurantIntentGroupId = "chinese" | "international" | "format";

export const RESTAURANT_INTENT_GROUPS: readonly {
  readonly id: RestaurantIntentGroupId;
  readonly tags: readonly RestaurantIntentTag[];
}[] = [
  { id: "chinese", tags: RESTAURANT_INTENT_TAGS.slice(0, 9) },
  { id: "international", tags: RESTAURANT_INTENT_TAGS.slice(9, 15) },
  { id: "format", tags: RESTAURANT_INTENT_TAGS.slice(15) },
];

export const RESTAURANT_SHORTCUTS = [
  "minnan_fujian",
  "seafood",
  "snacks_fast_food",
  "hot_pot",
  "barbecue",
  "japanese",
  "western",
  "coffee",
] as const satisfies readonly RestaurantIntentTag[];

const supportedTags = new Set<string>(RESTAURANT_INTENT_TAGS);

export function normalizeRestaurantIntentTags(values: unknown): RestaurantIntentTag[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<RestaurantIntentTag>();
  const normalized: RestaurantIntentTag[] = [];
  for (const value of values) {
    if (typeof value !== "string" || !supportedTags.has(value) || seen.has(value as RestaurantIntentTag)) {
      continue;
    }
    const tag = value as RestaurantIntentTag;
    seen.add(tag);
    normalized.push(tag);
  }
  return normalized;
}

const LABELS: Readonly<Record<RestaurantIntentTag, readonly [string, string]>> = {
  minnan_fujian: ["Minnan / Fujian", "闽南 / 福建菜"],
  sichuan_hunan: ["Sichuan / Hunan", "川菜 / 湘菜"],
  cantonese_dim_sum: ["Cantonese / dim sum", "粤菜 / 早茶"],
  jiangzhe: ["Jiangsu / Zhejiang", "江浙菜"],
  northeastern: ["Northeastern Chinese", "东北菜"],
  yunnan_guizhou: ["Yunnan / Guizhou", "云南 / 贵州菜"],
  northwestern_xinjiang: ["Northwestern / Xinjiang", "西北 / 新疆菜"],
  home_style: ["Home-style Chinese", "家常菜"],
  vegetarian: ["Vegetarian", "素食"],
  japanese: ["Japanese", "日本料理"],
  korean: ["Korean", "韩国料理"],
  western: ["Western", "西餐"],
  southeast_asian: ["Southeast Asian", "东南亚菜"],
  indian: ["Indian", "印度菜"],
  middle_eastern: ["Middle Eastern", "中东菜"],
  hot_pot: ["Hot pot", "火锅"],
  barbecue: ["Barbecue / grilled meat", "烧烤 / 烤肉"],
  seafood: ["Seafood", "海鲜"],
  noodles: ["Noodles / rice noodles", "面 / 粉"],
  dry_pot_grilled_fish: ["Dry pot / grilled fish", "香锅 / 烤鱼"],
  snacks_fast_food: ["Snacks / fast food", "小吃 / 快餐"],
  buffet: ["Buffet", "自助餐"],
  coffee: ["Coffee", "咖啡"],
  bakery_dessert: ["Bakery / dessert", "面包 / 甜点"],
  drinks: ["Drinks", "饮品"],
};

const GROUP_LABELS: Readonly<Record<RestaurantIntentGroupId, readonly [string, string]>> = {
  chinese: ["Chinese regional styles", "中式地域风味"],
  international: ["International styles", "国际风味"],
  format: ["Restaurant formats", "餐厅类型"],
};

export function restaurantIntentLabel(tag: RestaurantIntentTag, locale: SupportedLocale): string {
  return LABELS[tag][locale === "zh-CN" ? 1 : 0];
}

export function restaurantIntentGroupLabel(
  group: RestaurantIntentGroupId,
  locale: SupportedLocale,
): string {
  return GROUP_LABELS[group][locale === "zh-CN" ? 1 : 0];
}

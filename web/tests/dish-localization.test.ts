import type { Dish } from "../src/domain/contracts";
import { localizeDish, tagMessageKey } from "../src/i18n/dish-localization";

const dish = {
  name: "Charred Chicken Rice Bowl",
  description: "English description",
  translations: {
    "zh-CN": { name: "炭烤鸡肉饭", description: "炭烤鸡肉搭配米饭和时蔬。" },
  },
} as Dish;

test("selects natural Chinese dish text", () => {
  expect(localizeDish(dish, "zh-CN")).toEqual({
    name: "炭烤鸡肉饭",
    description: "炭烤鸡肉搭配米饭和时蔬。",
  });
});

test("falls back to canonical English for an old stored dish", () => {
  const oldDish = {
    name: dish.name,
    description: dish.description,
  } as Dish;
  expect(localizeDish(oldDish, "zh-CN").name).toBe("Charred Chicken Rice Bowl");
});

test("routes known tags through typed messages and preserves unknown tags", () => {
  expect(tagMessageKey("spicy")).toBe("tag.spicy");
  expect(tagMessageKey("seasonal")).toBeNull();
});

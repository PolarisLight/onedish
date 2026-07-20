import {
  RESTAURANT_INTENT_GROUPS,
  RESTAURANT_INTENT_TAGS,
  RESTAURANT_SHORTCUTS,
  normalizeRestaurantIntentTags,
} from "../src/restaurants/intent-tags";

test("ships twenty-five grouped intent tags and eight Xiamen shortcuts", () => {
  expect(RESTAURANT_INTENT_TAGS).toHaveLength(25);
  expect(RESTAURANT_INTENT_GROUPS).toHaveLength(3);
  expect(RESTAURANT_INTENT_GROUPS.flatMap((group) => group.tags)).toEqual(
    RESTAURANT_INTENT_TAGS,
  );
  expect(RESTAURANT_SHORTCUTS).toEqual([
    "minnan_fujian",
    "seafood",
    "snacks_fast_food",
    "hot_pot",
    "barbecue",
    "japanese",
    "western",
    "coffee",
  ]);
});

test("normalizer rejects unknowns and removes duplicates while preserving order", () => {
  expect(normalizeRestaurantIntentTags([
    "japanese",
    "unknown",
    "hot_pot",
    "japanese",
  ])).toEqual(["japanese", "hot_pot"]);
  expect(normalizeRestaurantIntentTags("japanese")).toEqual([]);
});

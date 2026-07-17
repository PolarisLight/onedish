import { defaultProfile, inferOneTapContext } from "../src/recommendation/context";
import { spec } from "./support/recommendation-fixtures";


test("infers lunch and merges the hungry quick state", () => {
  const profile = defaultProfile("en", spec);
  const result = inferOneTapContext({
    now: new Date("2026-07-18T12:00:00"),
    profile,
    history: [],
    quickState: "hungry",
    spec,
    sessionExclusions: [],
  });

  expect(result.mealPeriod).toBe("lunch");
  expect(result.input.constraints.minimum_protein_g).toBe(30);
  expect(result.input.constraints.desired_taste_tags).toEqual(
    expect.arrayContaining(["fresh", "filling", "warm"]),
  );
  expect(result.summary).toContain("Lunch");
});


test("projects real history into repetition and surprise preference", () => {
  const profile = defaultProfile("en", spec);
  const history = [
    { id: "meal-1", occurred_at: "2026-07-18T10:00:00Z", kind: "eaten" as const, dish_id: "dish-a", cuisine_tags: ["asian"], base_ingredient: "rice" },
    { id: "meal-2", occurred_at: "2026-07-17T10:00:00Z", kind: "eaten" as const, dish_id: "dish-a", cuisine_tags: ["asian"], base_ingredient: "rice" },
  ];
  const result = inferOneTapContext({
    now: new Date("2026-07-18T19:00:00"),
    profile,
    history,
    quickState: "surprise",
    spec,
    sessionExclusions: ["dish-b"],
  });

  expect(result.input.repetition.dish_ids).toEqual({ "dish-a": 2 });
  expect(result.input.repetition.base_ingredients).toEqual({ rice: 2 });
  expect(result.input.preferences.cuisine.asian).toBeLessThan(0);
  expect(result.input.session_exclusions).toEqual(["dish-b"]);
});

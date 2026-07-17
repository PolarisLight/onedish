import { NoSafeCandidate, recommendLocal } from "../src/recommendation/engine";
import { candidate, input, NOW, spec } from "./support/recommendation-fixtures";


test("hard allergen exclusions are never relaxed", async () => {
  await expect(recommendLocal(
    [candidate("unsafe", { allergens: ["peanuts"] })],
    input({ excluded_allergens: ["peanuts"] }),
    spec,
    NOW,
  )).rejects.toBeInstanceOf(NoSafeCandidate);
});


test("budget and taste change the winner", async () => {
  const candidates = [
    candidate("cheap-light", { price_minor: 900, taste_tags: ["light"] }),
    candidate("rich-expensive", { price_minor: 2400, taste_tags: ["rich"] }),
  ];

  const cheap = await recommendLocal(
    candidates,
    input({ max_price_minor: 1200, desired_taste_tags: ["light"] }),
    spec,
    NOW,
  );
  const rich = await recommendLocal(
    candidates,
    input({ max_price_minor: 3000, desired_taste_tags: ["rich"] }),
    spec,
    NOW,
  );

  expect(cheap.decision.winner_id).toBe("cheap-light");
  expect(rich.decision.winner_id).toBe("rich-expensive");
});


test("session exclusions force a different winner", async () => {
  const candidates = [candidate("alpha"), candidate("beta", { distance_m: 700 })];
  const first = await recommendLocal(candidates, input(), spec, NOW);
  const second = await recommendLocal(
    candidates,
    input({ session_exclusions: [first.decision.winner_id] }),
    spec,
    NOW,
  );

  expect(second.decision.winner_id).not.toBe(first.decision.winner_id);
  expect(second.decision.stages.find((stage) => stage.id === "safety")?.reason_counts)
    .toMatchObject({ session_excluded: 1 });
});


test("soft constraints relax in configured order and are disclosed", async () => {
  const result = await recommendLocal(
    [candidate("slow-rich", { price_minor: 2600, taste_tags: ["rich"], estimated_minutes: 30 })],
    input({
      max_price_minor: 1200,
      max_duration_minutes: 10,
      desired_taste_tags: ["light"],
    }),
    spec,
    NOW,
  );

  expect(result.decision.relaxations).toEqual(["taste", "duration", "budget"]);
  expect(result.decision.winner_id).toBe("slow-rich");
});

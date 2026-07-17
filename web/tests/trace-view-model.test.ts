import { projectTraceStage, strongestWinnerReasons } from "../src/elimination/trace-view-model";

test("projects the strongest real reason without invented copy", () => {
  const stage = { id: "safety_budget", input_count: 90, survivor_count: 64, reason_counts: { over_budget: 18, allergen_excluded: 8 }, representative_removed_ids: ["dish-a"] } as const;
  expect(projectTraceStage(stage, "en")).toMatchObject({ count: 64, reasonCode: "over_budget", removedCount: 26 });
  expect(projectTraceStage(stage, "zh-CN").reasonText).toBe("超过你的常用预算");
});

test("winner evidence contains at most three structured reasons", () => {
  expect(strongestWinnerReasons(["meal_period_match", "protein_match", "taste_match", "confidence_match"], "en")).toHaveLength(3);
});

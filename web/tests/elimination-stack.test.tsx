import { render, screen } from "@testing-library/react";
import { EliminationStack } from "../src/elimination/EliminationStack";
import type { TraceStageView } from "../src/elimination/trace-view-model";

test("renders a bounded stack from structured removal data", () => {
  const stage: TraceStageView = { id: "budget", count: 12, removedCount: 8, reasonCode: "over_budget", reasonText: "Over your usual budget", removedIds: ["a", "b", "c", "d"] };
  render(<EliminationStack stage={stage} reducedMotion={false} />);
  expect(screen.getByRole("list", { name: "Dishes being filtered" })).toBeVisible();
  expect(screen.getByText("Over your usual budget")).toBeVisible();
  expect(screen.getAllByRole("listitem").length).toBeLessThanOrEqual(4);
});

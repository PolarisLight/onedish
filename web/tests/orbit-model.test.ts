import type { HistoryEventRow } from "../src/db/db";
import {
  angleFromPoint,
  makeOrbitNodes,
  normalizeAngle,
  pointOnOrbit,
  shortestRotation,
} from "../src/history/orbit-model";

const now = new Date("2026-07-18T12:00:00Z");

function event(id: string, daysAgo: number, kind: HistoryEventRow["kind"], tag: string): HistoryEventRow {
  return { id, occurred_at: new Date(now.getTime() - daysAgo * 86_400_000).toISOString(), kind, taste_tags: [tag] };
}

test("filters by range and keeps outcome evidence separate", () => {
  const nodes = makeOrbitNodes([
    event("a", 1, "accepted", "warm"),
    event("b", 2, "rejected", "warm"),
    event("c", 10, "eaten", "fresh"),
  ], 7, now);
  expect(nodes).toHaveLength(1);
  expect(nodes[0]).toMatchObject({ id: "warm", count: 2, acceptedCount: 1, rejectedCount: 1 });
});

test("uses one angle for placement and top focus", () => {
  const node = makeOrbitNodes([event("a", 1, "accepted", "warm")], 7, now)[0]!;
  const point = pointOnOrbit(node.angleDeg, node.distance, 300, 300);
  expect(angleFromPoint(point.x, point.y, 300, 300)).toBeCloseTo(node.angleDeg);
  expect(normalizeAngle(node.angleDeg + shortestRotation(node.angleDeg, -90))).toBeCloseTo(270);
});

test("does not invent nodes for empty history", () => {
  expect(makeOrbitNodes([], 7, now)).toEqual([]);
});

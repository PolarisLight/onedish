import type { HistoryEventRow } from "../src/db/db";
import { makeOrbitNodes } from "../src/history/orbit-model";
import { RADIAL_TRACKS, polarPoint, radialDistance } from "../src/shared/radial-geometry";

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

test("assigns every node to one exact shared track", () => {
  const node = makeOrbitNodes([event("a", 1, "accepted", "warm")], 7, now)[0]!;
  const radius = RADIAL_TRACKS[node.trackIndex]!;
  expect(radialDistance(polarPoint(node.angleDeg, radius))).toBeCloseTo(radius, 8);
});

test("does not invent nodes for empty history", () => {
  expect(makeOrbitNodes([], 7, now)).toEqual([]);
});

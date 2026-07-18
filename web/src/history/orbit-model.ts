import type { HistoryEventRow } from "../db/db";

export interface OrbitNode {
  readonly id: string;
  readonly label: string;
  readonly count: number;
  readonly acceptedCount: number;
  readonly rejectedCount: number;
  readonly lastSeenAt: string;
  readonly angleDeg: number;
  readonly distance: number;
  readonly radius: number;
  readonly intensity: number;
}

function hash(value: string): number {
  return [...value].reduce((total, char) => (total * 31 + char.charCodeAt(0)) >>> 0, 2166136261);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeAngle(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

export function shortestRotation(fromDeg: number, targetDeg: number): number {
  return ((normalizeAngle(targetDeg) - normalizeAngle(fromDeg) + 540) % 360) - 180;
}

export function pointOnOrbit(angleDeg: number, distance: number, cx: number, cy: number) {
  const radians = angleDeg * Math.PI / 180;
  return { x: cx + Math.cos(radians) * distance, y: cy + Math.sin(radians) * distance };
}

export function angleFromPoint(x: number, y: number, cx: number, cy: number): number {
  return normalizeAngle(Math.atan2(y - cy, x - cx) * 180 / Math.PI);
}

export function makeOrbitNodes(events: readonly HistoryEventRow[], days: 7 | 30, now: Date): readonly OrbitNode[] {
  const cutoff = now.getTime() - days * 86_400_000;
  const evidenceKinds = new Set<HistoryEventRow["kind"]>(["accepted", "eaten", "rejected"]);
  const grouped = new Map<string, { count: number; acceptedCount: number; rejectedCount: number; lastSeenAt: string }>();

  for (const event of events) {
    const occurredAt = new Date(event.occurred_at).getTime();
    if (!Number.isFinite(occurredAt) || occurredAt < cutoff || occurredAt > now.getTime() || !evidenceKinds.has(event.kind)) continue;
    for (const tag of new Set([...(event.cuisine_tags ?? []), ...(event.taste_tags ?? [])])) {
      const id = tag.trim().toLocaleLowerCase();
      if (!id) continue;
      const current = grouped.get(id) ?? { count: 0, acceptedCount: 0, rejectedCount: 0, lastSeenAt: event.occurred_at };
      grouped.set(id, {
        count: current.count + 1,
        acceptedCount: current.acceptedCount + (event.kind === "accepted" || event.kind === "eaten" ? 1 : 0),
        rejectedCount: current.rejectedCount + (event.kind === "rejected" ? 1 : 0),
        lastSeenAt: event.occurred_at > current.lastSeenAt ? event.occurred_at : current.lastSeenAt,
      });
    }
  }

  return [...grouped.entries()]
    .sort(([leftId, left], [rightId, right]) => right.count - left.count || leftId.localeCompare(rightId))
    .slice(0, 8)
    .map(([id, group]) => {
      const recencyDays = (now.getTime() - new Date(group.lastSeenAt).getTime()) / 86_400_000;
      return {
        id,
        label: id,
        ...group,
        angleDeg: hash(id) % 360,
        distance: clamp(218 - group.count * 20, 118, 208),
        radius: clamp(28 + group.count * 9, 36, 72),
        intensity: clamp(1 - recencyDays / days, .28, 1),
      };
    });
}

import {
  RADIAL_TRACKS,
  connector,
  focusRotation,
  polarPoint,
  radialDistance,
  boxesOverlap,
  privacyReceiver,
  privacySlots,
} from "../src/shared/radial-geometry";

test.each(RADIAL_TRACKS)("places a node exactly on track %p", (radius) => {
  const point = polarPoint(-37, radius);
  expect(radialDistance(point)).toBeCloseTo(radius, 8);
});

test("focuses a node at twelve o'clock by the shortest turn", () => {
  expect(focusRotation(350, 20)).toBe(250);
  expect(Math.abs(focusRotation(350, 20) - 350)).toBeLessThanOrEqual(180);
});

test("connects exact normalized endpoints", () => {
  const start = { x: .5, y: .5 };
  const end = polarPoint(-40, RADIAL_TRACKS[2]);
  expect(connector(start, end)).toEqual({
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y,
  });
});

test("reserves distinct privacy slots and an external receiver", () => {
  const slots = privacySlots();
  expect(new Set(slots.map((slot) => `${slot.point.x}:${slot.point.y}`)).size).toBe(5);
  expect(radialDistance(privacyReceiver())).toBeGreaterThan(RADIAL_TRACKS[2]);
});

test("privacy node boxes fit the 320px content stage without overlap", () => {
  const stageSize = 284;
  const nodeWidths = [100, 80, 80, 92, 132];
  const boxes = privacySlots().map((slot, index) => ({
    x: slot.point.x * stageSize - nodeWidths[index]! / 2,
    y: slot.point.y * stageSize - 22,
    width: nodeWidths[index]!,
    height: 44,
  }));
  expect(boxes.every((box) => (
    box.x >= 0 && box.y >= 0 &&
    box.x + box.width <= stageSize && box.y + box.height <= stageSize
  ))).toBe(true);
  expect(boxes.some((box, index) => (
    boxes.slice(index + 1).some((other) => boxesOverlap(box, other))
  ))).toBe(false);
});

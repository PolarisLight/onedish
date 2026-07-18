import {
  RADIAL_TRACKS,
  connector,
  focusRotation,
  polarPoint,
  radialDistance,
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

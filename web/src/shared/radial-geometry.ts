export interface NormalizedPoint {
  readonly x: number;
  readonly y: number;
}

export const RADIAL_CENTER: NormalizedPoint = { x: .5, y: .5 };
export const RADIAL_TRACKS = [.22, .32, .42] as const;

export function polarPoint(angleDeg: number, radius: number): NormalizedPoint {
  const radians = angleDeg * Math.PI / 180;
  return {
    x: RADIAL_CENTER.x + Math.cos(radians) * radius,
    y: RADIAL_CENTER.y + Math.sin(radians) * radius,
  };
}

export function radialDistance(point: NormalizedPoint): number {
  return Math.hypot(point.x - RADIAL_CENTER.x, point.y - RADIAL_CENTER.y);
}

export function normalizeAngle(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

export function shortestRotation(fromDeg: number, targetDeg: number): number {
  return ((normalizeAngle(targetDeg) - normalizeAngle(fromDeg) + 540) % 360) - 180;
}

export function focusRotation(currentRotation: number, nodeAngle: number): number {
  return currentRotation + shortestRotation(currentRotation, -90 - nodeAngle);
}

export function connector(start: NormalizedPoint, end: NormalizedPoint) {
  return { x1: start.x, y1: start.y, x2: end.x, y2: end.y };
}

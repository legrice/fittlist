export const MOTION = { tap: 80, state: 140, sheet: 220 } as const;

export function motionDuration(kind: keyof typeof MOTION): number {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : MOTION[kind];
}

export function sheetShouldDismiss(distance: number, velocity: number): boolean {
  return distance >= 120 || (distance >= 40 && velocity >= 0.65);
}

export function resistedSheetDistance(distance: number): number {
  return distance <= 120 ? Math.max(0, distance) : 120 + (distance - 120) * 0.35;
}

/**
 * Private color labels for a studio manager's rota.
 *
 * These are stable tokens rather than user-provided CSS. They travel only
 * through the manager calendar DTO and never change a member calendar, a
 * public class card, or a shared image.
 */
export const STUDIO_PLANNER_COLORS = [
  { value: "lime", label: "Lime" },
  { value: "sky", label: "Sky" },
  { value: "lavender", label: "Lavender" },
  { value: "peach", label: "Peach" },
  { value: "rose", label: "Rose" },
  { value: "amber", label: "Amber" },
] as const;

export type StudioPlannerColor = (typeof STUDIO_PLANNER_COLORS)[number]["value"];

const STUDIO_PLANNER_COLOR_SET = new Set<string>(
  STUDIO_PLANNER_COLORS.map((color) => color.value),
);

export function isStudioPlannerColor(value: unknown): value is StudioPlannerColor {
  return typeof value === "string" && STUDIO_PLANNER_COLOR_SET.has(value);
}

export function studioPlannerColorLabel(value: StudioPlannerColor | null): string | null {
  if (!value) return null;
  return STUDIO_PLANNER_COLORS.find((color) => color.value === value)?.label ?? null;
}

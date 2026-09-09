import type { schema } from "@/db";
import { managedStudio } from "@/lib/managed-studio";
import { StandardCalendarEditor } from "@/components/StandardCalendarEditor";
import type { StandardCalendarSlot } from "@/app/actions/gym";
import { isStudioPlannerColor } from "@/lib/studio-planner";

export const dynamic = "force-dynamic";

export default async function StandardCalendarPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { studio } = await managedStudio(slug);
  const initial: Record<string, StandardCalendarSlot[]> = {};
  for (let day = 0; day < 7; day++) initial[String(day)] = (studio.standardWeek?.[String(day) as keyof schema.StandardWeek] ?? []).map((slot) => ({
    name: slot.name,
    startTime: slot.startTime,
    durationMin: slot.durationMin,
    plannerColor: isStudioPlannerColor(slot.plannerColor) ? slot.plannerColor : null,
  }));
  const base = `/s/${studio.slug ?? studio.id}/manage`;
  return <StandardCalendarEditor studioId={studio.id} backHref={base} initial={initial} />;
}

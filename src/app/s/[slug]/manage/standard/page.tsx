import { eq, or } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { currentUser } from "@/lib/current-user";
import { studioAccess } from "@/lib/studioaccess";
import { StandardCalendarEditor } from "@/components/StandardCalendarEditor";
import type { StandardCalendarSlot } from "@/app/actions/gym";
import { isStudioPlannerColor } from "@/lib/studio-planner";

export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function StandardCalendarPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = await getDb();
  const [studio] = await db.select().from(schema.studios).where(UUID_RE.test(slug)
    ? or(eq(schema.studios.slug, slug), eq(schema.studios.id, slug))
    : eq(schema.studios.slug, slug));
  if (!studio) notFound();
  const me = await currentUser();
  if (!me) notFound();
  const viewerId = me.id;
  if (!(await studioAccess(studio.id, { id: viewerId, kind: me.kind })).isManager) notFound();
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

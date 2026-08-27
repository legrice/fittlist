import { and, eq, or } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { staffView } from "@/app/actions/gym";
import { StudioShiftsView } from "@/components/StudioShiftsView";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The studio's shifts, for the people who work there.
//
// Unlike /manage this is not manager-only: a coach who lists this studio gets
// their own shifts and the open ones, which is the hole the staff spec is
// mostly about. `staffView` answers null for anyone else, including a studio
// that runs no schedule, so the 404 covers both.
export default async function ShiftsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { slug } = await params;
  const { preview } = await searchParams;
  const db = await getDb();
  const [studio] = await db
    .select()
    .from(schema.studios)
    .where(
      UUID_RE.test(slug)
        ? or(eq(schema.studios.slug, slug), eq(schema.studios.id, slug))
        : eq(schema.studios.slug, slug),
    );
  if (!studio) notFound();
  // Managers now work from Calendar. Detect that before building the heavier
  // coach-facing two-week shift feed so the redirect is nearly free.
  const viewerId = await getSessionUserId();
  if (!viewerId) notFound();
  const [manager] = await db
    .select({ id: schema.studioManagers.userId })
    .from(schema.studioManagers)
    .where(
      and(
        eq(schema.studioManagers.studioId, studio.id),
        eq(schema.studioManagers.userId, viewerId),
      ),
    )
    .limit(1);
  const coachPreview = !!manager && preview === "coach";
  if (manager && !coachPreview) redirect(`/s/${studio.slug ?? studio.id}/manage`);
  const view = await staffView(studio.id);
  if (!view) notFound();
  return (
    <StudioShiftsView
      view={view}
      canSchedule={!!studio.accountUserId}
      pageViews={null}
      showCoaches={studio.showCoaches}
      studio={null}
      coachPreview={coachPreview}
    />
  );
}

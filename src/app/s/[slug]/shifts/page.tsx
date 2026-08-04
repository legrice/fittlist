import { eq, or } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
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
export default async function ShiftsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
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
  const view = await staffView(studio.id);
  if (!view) notFound();
  return <StudioShiftsView view={view} />;
}

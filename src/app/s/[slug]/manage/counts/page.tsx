import { eq, or } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { studioAccess } from "@/lib/studioaccess";
import { gymCounts } from "@/app/actions/gym";
import { GymCountsView } from "@/components/GymCountsView";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Shifts worked, counted from the rota. Manager only, same door as the rota.
export default async function CountsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ m?: string }>;
}) {
  const { slug } = await params;
  const { m } = await searchParams;
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
  const viewerId = await getSessionUserId();
  if (!viewerId) notFound();
  const [me] = await db
    .select({ kind: schema.users.kind })
    .from(schema.users)
    .where(eq(schema.users.id, viewerId));
  if (!me) notFound();
  const access = await studioAccess(studio.id, { id: viewerId, kind: me.kind });
  if (!access.isManager) notFound();

  const counts = await gymCounts(studio.id, m);
  const base = `/s/${studio.slug ?? studio.id}/manage`;
  return (
    <GymCountsView
      studioName={studio.name}
      backHref={base}
      countsBase={`${base}/counts`}
      counts={counts}
    />
  );
}

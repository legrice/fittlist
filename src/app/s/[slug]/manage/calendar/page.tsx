import { eq, or } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { studioAccess } from "@/lib/studioaccess";
import { gymCatalog, gymCoaches, gymSchedule } from "@/app/actions/gym";
import { GymRota } from "@/components/GymRota";
import type { PlaceKind } from "@/lib/studio";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function StudioCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ w?: string }>;
}) {
  const { slug } = await params;
  const { w } = await searchParams;
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

  const [week, coaches, catalog, typeRows] = await Promise.all([
    gymSchedule(studio.id, Number(w) || 0),
    gymCoaches(studio.id),
    gymCatalog(studio.id),
    db.select({ name: schema.customClassTypes.name }).from(schema.customClassTypes),
  ]);
  const studioSlug = studio.slug ?? studio.id;

  return (
    <GymRota
      studioId={studio.id}
      studioName={studio.name}
      studioAddress={studio.address}
      studioSlug={studioSlug}
      manageBase={`/s/${studioSlug}/manage/calendar`}
      dashboardHref={`/s/${studioSlug}/manage`}
      hasAccount={!!studio.accountUserId}
      week={week}
      coaches={coaches}
      catalog={catalog}
      customTypes={typeRows.map((t) => t.name)}
      viewerId={viewerId}
      admin={{
        showCoaches: studio.showCoaches,
        approvalOn: studio.approveShiftChanges,
        studio: {
          id: studio.id,
          name: studio.name,
          address: studio.address,
          placeKind: studio.placeKind as PlaceKind,
          types: studio.types,
          about: studio.about ?? "",
          photo: studio.photo,
          contactEmail: studio.contactEmail ?? "",
          phone: studio.phone ?? "",
          website: studio.website ?? "",
          instagram: studio.instagram ?? "",
        },
      }}
    />
  );
}

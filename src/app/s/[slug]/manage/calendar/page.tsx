import { getDb, schema } from "@/db";
import { managedStudio } from "@/lib/managed-studio";
import { gymCatalog, gymCoaches, gymSchedule } from "@/app/actions/gym";
import { GymRota } from "@/components/GymRota";

export const dynamic = "force-dynamic";

export default async function StudioCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ w?: string }>;
}) {
  const { slug } = await params;
  const { w } = await searchParams;
  const { studio, me } = await managedStudio(slug);
  const viewerId = me.id;
  const db = await getDb();

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
    />
  );
}

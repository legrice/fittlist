import { eq, or } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { currentUser } from "@/lib/current-user";
import { studioAccess } from "@/lib/studioaccess";
import { gymCoaches, gymSchedule, shiftRequests } from "@/app/actions/gym";
import { StudioManageDashboard } from "@/components/StudioManageDashboard";
import type { PlaceKind } from "@/lib/studio";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The rota, for the people who run the place. Everything on this screen is
// behind studioAccess: not a manager, and the page isn't there at all, which
// is the same nothing an admin-only route gives anyone else.
export default async function ManageStudioPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const legacyParams = await searchParams;
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

  const me = await currentUser();
  if (!me) notFound();
  const viewerId = me.id;
  const access = await studioAccess(studio.id, { id: viewerId, kind: me.kind });
  if (!access.isManager) notFound();

  const [week, coaches, requests] = await Promise.all([
    gymSchedule(studio.id, 0),
    gymCoaches(studio.id),
    shiftRequests(studio.id),
  ]);
  const studioSlug = studio.slug ?? studio.id;
  const calendarKeys = ["w", "view", "m", "show"];
  if (calendarKeys.some((key) => legacyParams[key] !== undefined)) {
    const query = new URLSearchParams();
    for (const key of calendarKeys) {
      const value = legacyParams[key];
      if (typeof value === "string") query.set(key, value);
    }
    redirect(`/s/${studioSlug}/manage/calendar?${query.toString()}`);
  }
  const classes = week?.days.reduce((total, day) => total + day.items.length, 0) ?? 0;
  const openShifts = week?.days.reduce(
    (total, day) => total + day.items.filter((item) => !item.onUserId).length,
    0,
  ) ?? 0;

  return (
    <StudioManageDashboard
      studioName={studio.name}
      studioSlug={studioSlug}
      hasAccount={!!studio.accountUserId}
      classCount={classes}
      openShiftCount={openShifts}
      staffCount={coaches.length}
      requests={requests}
      admin={{
        showCoaches: studio.showCoaches,
        approvalOn: studio.approveShiftChanges,
        studio: {
          id: studio.id,
          name: studio.name,
          address: studio.address,
          timeZone: studio.timeZone,
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

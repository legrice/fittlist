import { eq, or } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { studioStaff } from "@/app/actions/gym";
import { StudioStaffView } from "@/components/StudioStaffView";
import type { PlaceKind } from "@/lib/studio";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The studio's people: who runs the page, and who takes the classes. Manager
// only, the same door the rota and the counts use. Unlike those two it does
// not need the gym account: a studio is claimed the moment it has a manager,
// and staff is what you set up before you turn a schedule on.
export default async function StaffPage({ params }: { params: Promise<{ slug: string }> }) {
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
  // The focused loader performs the manager check itself. Avoid repeating a
  // session lookup, user lookup, and manager lookup before asking it again.
  const staff = await studioStaff(studio.id);
  if (!staff) notFound();
  return (
    <StudioStaffView
      studioId={studio.id}
      studioName={studio.name}
      studioSlug={studio.slug ?? studio.id}
      staff={staff}
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

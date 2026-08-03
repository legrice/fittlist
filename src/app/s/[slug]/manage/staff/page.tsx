import { eq, or } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { studioAccess } from "@/lib/studioaccess";
import { studioStaff } from "@/app/actions/gym";
import { StudioStaffView } from "@/components/StudioStaffView";

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
  const viewerId = await getSessionUserId();
  if (!viewerId) notFound();
  const [me] = await db
    .select({ kind: schema.users.kind })
    .from(schema.users)
    .where(eq(schema.users.id, viewerId));
  if (!me) notFound();
  const access = await studioAccess(studio.id, { id: viewerId, kind: me.kind });
  if (!access.isManager) notFound();

  const staff = await studioStaff(studio.id);
  if (!staff) notFound();
  return (
    <StudioStaffView
      studioId={studio.id}
      studioName={studio.name}
      backHref={`/s/${studio.slug ?? studio.id}`}
      staff={staff}
    />
  );
}

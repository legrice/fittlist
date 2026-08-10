import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { avatarColor } from "@/lib/avatar";
import { getSessionUserId } from "@/lib/session";
import { listNotifications } from "@/lib/notify";
import { markUpdatesSeen } from "@/app/actions/notifications";
import { MarkSeen } from "@/components/MarkSeen";
import { AppChrome } from "@/components/AppChrome";
import { UpdatesScreen } from "@/components/UpdatesScreen";
import { lookMode } from "@/lib/darkmode";

export const dynamic = "force-dynamic";

// The screen behind the header bell: notifications alone, by Matt's call.
// Messages have their own door (the chat bubble) and their own screen at
// /inbox; the old ?tab=messages links land there.
export default async function UpdatesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  const { tab } = await searchParams;
  if (tab === "messages") redirect("/inbox");
  const db = await getDb();
  const [me] = await db
    .select({ look: schema.users.look })
    .from(schema.users)
    .where(eq(schema.users.id, userId));

  const rows = (await listNotifications(userId)).map((n) => ({
    ...n,
    // A face when we know whose, so "New follower" is someone rather than a badge.
    actor: n.actorId
      ? {
          name: n.actorName ?? "",
          photo: n.actorPhoto,
          color: avatarColor({ id: n.actorId, avatarColor: n.actorColor }),
          handle: n.actorHandle,
        }
      : null,
  }));
  // Landing here is the "I've seen these" signal — the badge clears from the
  // client once the page is up (see MarkSeen). Message unreads stay
  // per-thread and clear when a thread is opened.

  return (
    <section className="screen admin hasnav" data-mode={lookMode(me?.look)}>
      <MarkSeen action={markUpdatesSeen} />
      <UpdatesScreen notifications={rows} header={<AppChrome userId={userId} bar />} />
    </section>
  );
}

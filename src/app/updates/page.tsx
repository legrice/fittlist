import { desc, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { avatarColor } from "@/lib/avatar";
import { getSessionUserId } from "@/lib/session";
import { listNotifications, markNotificationsRead } from "@/lib/notify";
import { UpdatesScreen } from "@/components/UpdatesScreen";

export const dynamic = "force-dynamic";

// One surface behind the header bell: the notifications feed and the
// private-session messages inbox, toggled inside UpdatesScreen.
export default async function UpdatesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  const { tab } = await searchParams;
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
  // Landing here is the "I've seen these" signal — clear the unread badge.
  // Message unreads stay per-thread and clear when a thread is opened.
  await markNotificationsRead(userId);

  const threadRows = await db
    .select()
    .from(schema.inquiryThreads)
    .where(eq(schema.inquiryThreads.coachUserId, userId))
    .orderBy(desc(schema.inquiryThreads.lastMessageAt));
  const ids = threadRows.map((t) => t.id);
  const msgs = ids.length
    ? await db
        .select()
        .from(schema.inquiryMessages)
        .where(inArray(schema.inquiryMessages.threadId, ids))
        .orderBy(desc(schema.inquiryMessages.createdAt))
    : [];
  const latest = new Map<string, (typeof msgs)[number]>();
  for (const m of msgs) if (!latest.has(m.threadId)) latest.set(m.threadId, m);
  const threads = threadRows.map((t) => {
    const last = latest.get(t.id);
    return {
      id: t.id,
      who: t.requesterName || t.requesterEmail,
      preview: last ? `${last.fromCoach ? "You: " : ""}${last.body}` : "",
      unread: t.coachUnread,
      at: t.lastMessageAt,
      feedback: t.kind === "feedback",
    };
  });

  return (
    <section className="screen admin" data-mode={me?.look === "dark" ? "dark" : undefined}>
      <UpdatesScreen
        notifications={rows}
        threads={threads}
        initialTab={tab === "messages" ? "messages" : "notifications"}
      />
    </section>
  );
}

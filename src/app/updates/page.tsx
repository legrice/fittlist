import { and, desc, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { avatarColor } from "@/lib/avatar";
import { getSessionUserId } from "@/lib/session";
import { listNotifications } from "@/lib/notify";
import { markUpdatesSeen } from "@/app/actions/notifications";
import { AppChrome } from "@/components/AppChrome";
import { UpdatesScreen } from "@/components/UpdatesScreen";
import { lookMode } from "@/lib/darkmode";

export const dynamic = "force-dynamic";

// One surface behind the header bell: notification activity and message
// threads, toggled inside UpdatesScreen.
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
    .select({ look: schema.users.look, email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, userId));

  // Messages own their segment below, so their duplicate notification rows
  // stay out of the Notifications list. Feedback replies remain here because
  // the member reads those in the dedicated feedback room.
  const rows = (await listNotifications(userId, 50, ["message", "feedback"]))
    .map((n) => ({
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

  // Both chairs: threads sent to you (you're the coach) and threads you
  // started. Feedback stays out of the requester's side because it has its
  // own room, while the admin still sees incoming feedback among Messages.
  const [coachSide, mineSide] = await Promise.all([
    db
      .select()
      .from(schema.inquiryThreads)
      .where(eq(schema.inquiryThreads.coachUserId, userId))
      .orderBy(desc(schema.inquiryThreads.lastMessageAt)),
    me
      ? db
          .select()
          .from(schema.inquiryThreads)
          .where(
            and(
              eq(schema.inquiryThreads.requesterEmail, me.email),
              eq(schema.inquiryThreads.kind, "inquiry"),
            ),
          )
          .orderBy(desc(schema.inquiryThreads.lastMessageAt))
      : Promise.resolve([]),
  ]);
  const mine = mineSide.filter((thread) => thread.coachUserId !== userId);
  const coachIds = [...new Set(mine.map((thread) => thread.coachUserId))];
  const coachNames = coachIds.length
    ? await db
        .select({ id: schema.users.id, name: schema.users.name })
        .from(schema.users)
        .where(inArray(schema.users.id, coachIds))
    : [];
  const coachById = new Map(coachNames.map((coach) => [coach.id, coach.name]));
  const ids = [...coachSide.map((thread) => thread.id), ...mine.map((thread) => thread.id)];
  const messages = ids.length
    ? await db
        .select()
        .from(schema.inquiryMessages)
        .where(inArray(schema.inquiryMessages.threadId, ids))
        .orderBy(desc(schema.inquiryMessages.createdAt))
    : [];
  const latest = new Map<string, (typeof messages)[number]>();
  for (const message of messages) {
    if (!latest.has(message.threadId)) latest.set(message.threadId, message);
  }
  const threads = [
    ...coachSide.map((thread) => {
      const last = latest.get(thread.id);
      return {
        id: thread.id,
        who: thread.requesterName || thread.requesterEmail,
        preview: last ? `${last.fromCoach ? "You: " : ""}${last.body}` : "",
        unread: thread.coachUnread,
        at: thread.lastMessageAt,
        feedback: thread.kind === "feedback",
      };
    }),
    ...mine.map((thread) => {
      const last = latest.get(thread.id);
      return {
        id: thread.id,
        who: coachById.get(thread.coachUserId) || "Coach",
        preview: last ? `${last.fromCoach ? "" : "You: "}${last.body}` : "",
        unread: thread.requesterUnread,
        at: thread.lastMessageAt,
        feedback: false,
      };
    }),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <section className="screen admin hasnav" data-mode={lookMode(me?.look)}>
      <UpdatesScreen
        notifications={rows}
        threads={threads}
        initialTab={tab === "messages" ? "messages" : "notifications"}
        markSeen={markUpdatesSeen}
        header={<AppChrome userId={userId} bar />}
      />
    </section>
  );
}

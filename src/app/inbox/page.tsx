import { and, desc, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { AppChrome } from "@/components/AppChrome";
import { UpdatesScreen } from "@/components/UpdatesScreen";
import { getDb, schema } from "@/db";
import { lookMode } from "@/lib/darkmode";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  const db = await getDb();
  const [me] = await db
    .select({ look: schema.users.look, email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (!me) redirect("/");

  const [coachSide, mineSide] = await Promise.all([
    db
      .select()
      .from(schema.inquiryThreads)
      .where(eq(schema.inquiryThreads.coachUserId, userId))
      .orderBy(desc(schema.inquiryThreads.lastMessageAt)),
    db
      .select()
      .from(schema.inquiryThreads)
      .where(
        and(
          eq(schema.inquiryThreads.requesterEmail, me.email),
          eq(schema.inquiryThreads.kind, "inquiry"),
        ),
      )
      .orderBy(desc(schema.inquiryThreads.lastMessageAt)),
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
    <section className="screen admin hasnav" data-mode={lookMode(me.look)}>
      <UpdatesScreen
        mode="messages"
        threads={threads}
        header={<AppChrome userId={userId} bar />}
      />
    </section>
  );
}

import { and, desc, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { AppChrome } from "@/components/AppChrome";
import { MessagesScreen } from "@/components/UpdatesScreen";
import { lookMode } from "@/lib/darkmode";

export const dynamic = "force-dynamic";

// The screen behind the header's chat bubble: the message threads alone,
// by Matt's call. It redirected into Updates' Messages tab for a while;
// the tab went with the second door. Individual threads live at /inbox/[id].
export default async function InboxPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  const db = await getDb();
  const [me] = await db
    .select({ look: schema.users.look, email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, userId));

  // Both chairs: threads sent to you (you're the coach) and threads you
  // started (your email is the one on them). Feedback stays out of the second
  // set; that conversation already has its own room at /feedback.
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
  const mine = mineSide.filter((t) => t.coachUserId !== userId);
  const coachIds = [...new Set(mine.map((t) => t.coachUserId))];
  const coachNames = coachIds.length
    ? await db
        .select({ id: schema.users.id, name: schema.users.name })
        .from(schema.users)
        .where(inArray(schema.users.id, coachIds))
    : [];
  const coachById = new Map(coachNames.map((c) => [c.id, c.name]));
  const ids = [...coachSide.map((t) => t.id), ...mine.map((t) => t.id)];
  const msgs = ids.length
    ? await db
        .select()
        .from(schema.inquiryMessages)
        .where(inArray(schema.inquiryMessages.threadId, ids))
        .orderBy(desc(schema.inquiryMessages.createdAt))
    : [];
  const latest = new Map<string, (typeof msgs)[number]>();
  for (const m of msgs) if (!latest.has(m.threadId)) latest.set(m.threadId, m);
  const threads = [
    ...coachSide.map((t) => {
      const last = latest.get(t.id);
      return {
        id: t.id,
        who: t.requesterName || t.requesterEmail,
        preview: last ? `${last.fromCoach ? "You: " : ""}${last.body}` : "",
        unread: t.coachUnread,
        at: t.lastMessageAt,
        feedback: t.kind === "feedback",
      };
    }),
    ...mine.map((t) => {
      const last = latest.get(t.id);
      return {
        id: t.id,
        who: coachById.get(t.coachUserId) || "Coach",
        preview: last ? `${last.fromCoach ? "" : "You: "}${last.body}` : "",
        unread: t.requesterUnread,
        at: t.lastMessageAt,
        feedback: false,
      };
    }),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <section className="screen admin hasnav" data-mode={lookMode(me?.look)}>
      <MessagesScreen threads={threads} header={<AppChrome userId={userId} bar />} />
    </section>
  );
}

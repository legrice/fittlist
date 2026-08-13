import { and, desc, eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { AppChrome } from "@/components/AppChrome";
import { UpdatesScreen } from "@/components/UpdatesScreen";
import { getDb, schema } from "@/db";
import { avatarColor } from "@/lib/avatar";
import { lookMode } from "@/lib/darkmode";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  const db = await getDb();
  const [me] = await db
    .select({ id: schema.users.id, look: schema.users.look, email: schema.users.email })
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
  const messageRows = await db.select({
    id: schema.users.id,
    name: schema.users.name,
    handle: schema.users.handle,
    photo: schema.users.photo,
    photoThumb: schema.users.photoThumb,
    avatarColor: schema.users.avatarColor,
    kind: schema.users.kind,
    messagesOpen: schema.users.messagesOpen,
  }).from(schema.users);
  const messagePeople = messageRows
    .filter((person) => person.id !== me.id && person.kind !== "gym" && person.handle && person.messagesOpen)
    .map((person) => ({
      id: person.id,
      name: person.name.trim() || person.handle!,
      handle: person.handle!,
      photo: person.photoThumb ?? person.photo,
      color: avatarColor(person),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <section className="screen admin hasnav" data-mode={lookMode(me.look)}>
      <UpdatesScreen
        mode="messages"
        threads={threads}
        messagePeople={messagePeople}
        header={<AppChrome userId={userId} bar />}
      />
    </section>
  );
}

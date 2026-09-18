import { and, eq, isNotNull, ne, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { AppChrome } from "@/components/AppChrome";
import { UpdatesScreen } from "@/components/UpdatesScreen";
import { getDb, schema } from "@/db";
import { avatarColor } from "@/lib/avatar";
import { lookMode } from "@/lib/darkmode";
import { inboxThreads } from "@/lib/inbox-threads";
import { currentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const me = await currentUser();
  if (!me) redirect("/");
  const userId = me.id;
  const db = await getDb();

  const threads = await inboxThreads(me);
  const messageRows = await db.select({
    id: schema.users.id,
    name: schema.users.name,
    handle: schema.users.handle,
    photo: sql<string | null>`coalesce(${schema.users.photoThumb}, ${schema.users.photo})`,
    avatarColor: schema.users.avatarColor,
    kind: schema.users.kind,
    messagesOpen: schema.users.messagesOpen,
  }).from(schema.users).where(and(
    ne(schema.users.id, me.id),
    ne(schema.users.kind, "gym"),
    isNotNull(schema.users.handle),
    ne(schema.users.handle, ""),
    eq(schema.users.messagesOpen, true),
  ));
  const messagePeople = messageRows
    .map((person) => ({
      id: person.id,
      name: person.name.trim() || person.handle!,
      handle: person.handle!,
      photo: person.photo,
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

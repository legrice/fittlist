import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { avatarColor } from "@/lib/avatar";
import { fansVisible } from "@/lib/flags";
import { unreadNotifications } from "@/lib/notify";
import { getSessionUserId } from "@/lib/session";
import { AppHeader } from "@/components/AppHeader";
import { MemberAccount } from "@/components/MemberAccount";

export const dynamic = "force-dynamic";

// The member's account. Coaches have a bigger one inside the app shell, so
// they get sent there instead of keeping two of the same thing in sync.
export default async function YouPage() {
  if (!(await fansVisible())) redirect("/");
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  const db = await getDb();
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!me) redirect("/");
  if (me.handle) redirect("/app?acct=1");

  const going = await db
    .select({ id: schema.attendances.id })
    .from(schema.attendances)
    .where(eq(schema.attendances.userId, userId));
  const unread = await unreadNotifications(userId);

  return (
    <section className="screen" data-mode={me.look === "dark" ? "dark" : undefined}>
      <div className="pad">
        <AppHeader unread={unread} />
        <div className="calbar-title">You</div>
        <MemberAccount
          name={me.name}
          email={me.email}
          photo={me.photo}
          color={avatarColor(me)}
          look={me.look}
          goingCount={going.length}
        />
      </div>
    </section>
  );
}

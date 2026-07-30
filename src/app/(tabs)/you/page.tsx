import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { avatarColor } from "@/lib/avatar";
import { feedbackHost } from "@/lib/feedback";
import { fansVisible } from "@/lib/flags";
import { getSessionUserId } from "@/lib/session";
import { MemberAccount } from "@/components/MemberAccount";

export const dynamic = "force-dynamic";

// The member's account. Coaches have a bigger one inside the app shell, so
// they get sent there instead of keeping two of the same thing in sync.
export default async function YouPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const { edit } = await searchParams;
  if (!(await fansVisible())) redirect("/");
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  const db = await getDb();
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!me) redirect("/");
  // Members have handles now too, so "has a handle" no longer means "coach".
  if (me.kind !== "fan") redirect("/app?acct=1");
  // Claimed a link but never finished setup: the wizard is the better landing.
  if (me.handle && !me.onboardedAt) redirect("/welcome");

  const going = await db
    .select({ id: schema.attendances.id })
    .from(schema.attendances)
    .where(eq(schema.attendances.userId, userId));

  const host = await feedbackHost();

  return (
    <>
      <div className="calbar-title">You</div>
        <MemberAccount
          name={me.name}
          email={me.email}
          handle={me.handle}
          title={me.title ?? ""}
          about={me.about ?? ""}
          location={me.location ?? ""}
          photo={me.photo}
          color={avatarColor(me)}
          look={me.look}
          goingCount={going.length}
          openEditor={edit === "1"}
          canSendFeedback={!!host && host.email.toLowerCase() !== me.email.toLowerCase()}
          discoverable={me.discoverable}
          approveFollowers={me.approveFollowers}
        />
    </>
  );
}

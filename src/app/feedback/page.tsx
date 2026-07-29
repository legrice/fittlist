import { eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { myFeedback } from "@/app/actions/feedback";
import { getDb, schema } from "@/db";
import { feedbackHost } from "@/lib/feedback";
import { getSessionUserId } from "@/lib/session";
import { FeedbackThread } from "@/components/FeedbackThread";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

// Telling us something is broken should not mean finding an email address.
//
// Coaches and members both land here from a settings row. It's the same
// thread every time, so a follow-up three weeks later still has the first
// message above it.
export default async function FeedbackPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  const db = await getDb();
  const [me] = await db
    .select({ kind: schema.users.kind, look: schema.users.look, email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (!me) redirect("/");

  const host = await feedbackHost();
  // The person feedback goes to has no one to send it to.
  if (!host || host.email.toLowerCase() === me.email.toLowerCase()) redirect("/updates?tab=messages");

  const thread = await myFeedback();
  const back = me.kind === "fan" ? "/you" : "/app?acct=1";

  return (
    <section className="screen chatscreen" data-mode={me.look === "dark" ? "dark" : undefined}>
      <div className="chattop">
        <Link className="iconbtn chatback" aria-label="Back" href={back}>
          <Icon name="arrow_back" size={18} />
        </Link>
        <div className="chattop-txt">
          <span className="chattop-nm">Send feedback</span>
        </div>
      </div>
      <FeedbackThread messages={thread?.messages ?? []} />
    </section>
  );
}

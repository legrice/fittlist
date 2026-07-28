import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { avatarColor } from "@/lib/avatar";
import { BackLink } from "@/components/BackLink";
import { FollowersList, type FollowerRow } from "@/components/FollowersList";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

// The list behind the Followers stat. A count on its own is a scoreboard; the
// list is the thing a coach can act on — see who showed up, and follow back the
// ones who coach too.
export default async function FollowersPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  const db = await getDb();
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!me?.handle) redirect("/");

  const rows = await db
    .select()
    .from(schema.subscribers)
    .where(and(eq(schema.subscribers.trainerUserId, userId), isNull(schema.subscribers.optedOutAt)))
    .orderBy(desc(schema.subscribers.createdAt));

  // Match on email rather than subscribers.userId: a plain email subscriber who
  // later made an account never got that column backfilled, and they're the same
  // person. The email is the identity here, same as it is for the digest.
  const emails = [...new Set(rows.map((r) => r.email))];
  const accounts = emails.length
    ? await db.select().from(schema.users).where(inArray(schema.users.email, emails))
    : [];
  const byEmail = new Map(accounts.map((u) => [u.email, u]));

  // Which of them am I already following? Same email-keyed lookup the profile
  // page uses, so the button opens in the right state.
  const mine = await db
    .select({ trainerUserId: schema.subscribers.trainerUserId })
    .from(schema.subscribers)
    .where(and(eq(schema.subscribers.email, me.email), isNull(schema.subscribers.optedOutAt)));
  const following = new Set(mine.map((r) => r.trainerUserId));

  const followers: FollowerRow[] = rows.map((r) => {
    const u = byEmail.get(r.email);
    if (!u) {
      return {
        id: r.id,
        name: r.email,
        sub: "Follows by email",
        photo: null,
        color: "#6b6555",
        handle: null,
        canFollow: false,
        following: false,
      };
    }
    const name = u.name.trim() || u.email.split("@")[0];
    return {
      id: r.id,
      name,
      sub:
        [u.title?.trim(), u.location?.trim()].filter(Boolean).join(" · ") ||
        (u.handle ? `fittlist.co/${u.handle}` : u.email),
      photo: u.photo,
      color: avatarColor(u),
      handle: u.handle,
      canFollow: !!u.handle && u.kind === "coach",
      following: following.has(u.id),
    };
  });

  const n = followers.length;

  return (
    <section className="screen admin" data-mode={me.look === "dark" ? "dark" : undefined}>
      <div className="pad">
        <div className="folback">
          <BackLink className="evback" href="/app?acct=1" label="Back to your profile">
            <Icon name="arrow_back" size={21} />
          </BackLink>
        </div>
        <div className="admintop">
          <div>
            <h1>Followers</h1>
            <p className="adminsub">
              {n === 0
                ? "Nobody yet"
                : `${n} ${n === 1 ? "person gets" : "people get"} your schedule every week`}
            </p>
          </div>
        </div>
        <FollowersList followers={followers} />
      </div>
    </section>
  );
}

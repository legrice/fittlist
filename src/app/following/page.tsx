import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";
import { avatarColor } from "@/lib/avatar";
import { BackLink } from "@/components/BackLink";
import { FollowersList, type FollowerRow } from "@/components/FollowersList";
import { AppChrome } from "@/components/AppChrome";
import { Icon } from "@/components/Icon";
import { lookMode } from "@/lib/darkmode";

export const dynamic = "force-dynamic";

// The list behind the Following stat, and the other half of /followers.
//
// Every count on the You screen opens the list it counts; this one had no
// list to open, so the stat pointed at nothing and the number was decoration.
// It is the same rows and the same component the followers list uses, read
// from the other end: there, the people who follow you, here, the people you
// follow.
//
// It stays private, which is the whole point of the follow line: this is your
// own list on your own screen, nobody else can see it, and nothing here is
// published anywhere. The tab called Following is your merged week; this is
// the people behind it.
export default async function FollowingPage() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  const db = await getDb();
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!me) redirect("/");

  // Keyed on the email, the same way every other follow lookup is: somebody
  // who subscribed before they had an account never got `userId` backfilled,
  // and they are the same person.
  const rows = await db
    .select()
    .from(schema.subscribers)
    .where(and(eq(schema.subscribers.email, me.email), isNull(schema.subscribers.optedOutAt)))
    .orderBy(desc(schema.subscribers.createdAt));

  const ids = [...new Set(rows.map((r) => r.trainerUserId))].filter((id) => id !== userId);
  const accounts = ids.length
    ? await db.select().from(schema.users).where(inArray(schema.users.id, ids))
    : [];
  const byId = new Map(accounts.map((u) => [u.id, u]));

  const people: FollowerRow[] = rows.flatMap((r) => {
    const u = byId.get(r.trainerUserId);
    // A gym account has no page to open and nobody follows one yet; if the
    // row's subject has gone, there is nothing honest to draw.
    if (!u || !u.handle) return [];
    const name = u.name.trim() || u.email.split("@")[0];
    return [
      {
        id: r.id,
        name,
        sub:
          [u.title?.trim(), u.location?.trim()].filter(Boolean).join(" · ") ||
          `fittlist.co/${u.handle}`,
        photo: u.photo,
        color: avatarColor(u),
        handle: u.handle,
        // Already following, by construction: the control is the way out.
        canFollow: true,
        following: true,
        userId: u.id,
      },
    ];
  });

  const n = people.length;

  return (
    <section className="screen admin hasnav" data-mode={lookMode(me.look)}>
      <div className="pad">
        <AppChrome userId={userId} bar />
        <div className="folback">
          <BackLink className="evback" href="/settings" label="Back to settings">
            <Icon name="arrow_back" size={23} />
          </BackLink>
        </div>
        <div className="admintop">
          <div>
            <h1>Following</h1>
            <p className="adminsub">
              {n === 0
                ? "Nobody yet"
                : `${n} ${n === 1 ? "person whose" : "people whose"} week you get`}
            </p>
          </div>
        </div>
        <FollowersList followers={people} pending={[]} />
      </div>
    </section>
  );
}

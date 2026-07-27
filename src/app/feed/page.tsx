import { and, eq, inArray, isNull } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/db";
import { fansEnabled } from "@/lib/flags";
import { getSessionUserId } from "@/lib/session";
import { logout } from "@/app/actions/auth";
import { Icon } from "@/components/Icon";
import { Wordmark } from "@/components/Wordmark";

export const dynamic = "force-dynamic";

// The fan home: the coaches you follow. Phase 2 adds the merged upcoming
// schedule; Phase 3 adds discovery. Dark until FANS_ENABLED=true.
export default async function FeedPage() {
  if (!fansEnabled()) redirect("/");
  const userId = await getSessionUserId();
  if (!userId) redirect("/");
  const db = await getDb();
  const [me] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!me) redirect("/");

  const followRows = await db
    .select({ trainerUserId: schema.subscribers.trainerUserId })
    .from(schema.subscribers)
    .where(and(eq(schema.subscribers.email, me.email), isNull(schema.subscribers.optedOutAt)));
  const trainerIds = followRows.map((r) => r.trainerUserId).filter((id) => id !== userId);
  const coaches = trainerIds.length
    ? await db.select().from(schema.users).where(inArray(schema.users.id, trainerIds))
    : [];
  coaches.sort((a, b) => a.name.localeCompare(b.name));

  return (
    <section className="screen admin" data-mode={me.look === "dark" ? "dark" : undefined}>
      <div className="pad">
        <div className="brandbar feedbar">
          <Wordmark variant="ink" beta />
        </div>
        <div className="calbar-title">Your coaches</div>

        {coaches.length === 0 ? (
          <div className="empty-block">
            <h2>Nobody yet</h2>
            <p>
              Open a coach&rsquo;s FittList page and tap Follow — their schedule lands here and in
              your weekly email.
            </p>
          </div>
        ) : (
          <div className="feedcoaches">
            {coaches.map((c) => (
              <Link key={c.id} href={`/${c.handle}`} className="feedcoach">
                {c.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="feedcoach-av" src={c.photo} alt="" />
                ) : (
                  <span className="feedcoach-av feedcoach-av-empty" aria-hidden="true">
                    {(c.name.trim().charAt(0) || "?").toUpperCase()}
                  </span>
                )}
                <span className="feedcoach-txt">
                  <span className="nm">{c.name}</span>
                  <span className="sub">
                    {[c.title, c.location].filter(Boolean).join(" · ") || `fittlist.co/${c.handle}`}
                  </span>
                </span>
                <span className="feedcoach-chev">
                  <Icon name="chevron_right" size={20} />
                </span>
              </Link>
            ))}
          </div>
        )}

        <form action={logout}>
          <button type="submit" className="logoutbtn">
            Log out
          </button>
        </form>
      </div>
    </section>
  );
}

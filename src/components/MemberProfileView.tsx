import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { avatarColor } from "@/lib/avatar";
import { viewerLook } from "@/lib/look";
import { BackLink } from "@/components/BackLink";
import { Icon } from "@/components/Icon";
import { MemberProfileActions } from "@/components/MemberProfileActions";

// A member's public profile. Deliberately not the coach page: there's no
// schedule behind it, nothing to book, and nobody to email. It's who they are
// and who they train with, which is what a coach seeing a new follower, or
// another member finding them, actually wants to know.
export async function MemberProfileView({
  user,
  isOwner,
  from,
}: {
  user: typeof schema.users.$inferSelect;
  isOwner: boolean;
  from?: string;
}) {
  const db = await getDb();
  // Who they follow, and only the ones with a live page: a follow row can point
  // at an account that hasn't set one up.
  const followRows = await db
    .select({ trainerUserId: schema.subscribers.trainerUserId })
    .from(schema.subscribers)
    .where(and(eq(schema.subscribers.email, user.email), isNull(schema.subscribers.optedOutAt)));
  const ids = [...new Set(followRows.map((r) => r.trainerUserId))].filter((id) => id !== user.id);
  // One query, not one per coach: this ran on every profile view.
  const coaches = (
    ids.length ? await db.select().from(schema.users).where(inArray(schema.users.id, ids)) : []
  )
    .filter((c) => c.handle && c.kind === "coach")
    .sort((a, b) => a.name.localeCompare(b.name));

  const backTo =
    from === "discover"
      ? { href: "/discover", label: "Back to Discover" }
      : from === "home"
        ? { href: "/feed", label: "Back to Following" }
        : from === "followers"
          ? { href: "/followers", label: "Back to your followers" }
          : null;

  const name = user.name.trim() || user.email.split("@")[0];
  const initial = (name.charAt(0) || "?").toUpperCase();

  return (
    <div className="pub memberpub" data-mode={await viewerLook()}>
      <div className="profwrap">
        <div className="mempro-top">
          {backTo ? (
            <BackLink className="evback" href={backTo.href} label={backTo.label}>
              <Icon name="arrow_back" size={21} />
            </BackLink>
          ) : (
            <span />
          )}
          {isOwner && <MemberProfileActions />}
        </div>

        <div className="mempro-id">
          {user.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="mempro-av" src={user.photo} alt="" />
          ) : (
            <span
              className="mempro-av mempro-av-empty"
              style={{ background: avatarColor(user) }}
              aria-hidden="true"
            >
              {initial}
            </span>
          )}
          <h1 className="mempro-nm">{name}</h1>
          {user.title?.trim() && <p className="mempro-title">{user.title}</p>}
          {user.location?.trim() && (
            <p className="mempro-loc">
              <Icon name="place" size={14} /> {user.location}
            </p>
          )}
        </div>

        {user.about?.trim() && <p className="mempro-about">{user.about}</p>}

        <div className="mempro-sec">
          <h2 className="prof-sec-h">
            Trains with {coaches.length > 0 && <span className="mempro-n">{coaches.length}</span>}
          </h2>
          {coaches.length === 0 ? (
            <p className="mempro-none">
              {isOwner
                ? "Follow a coach and they'll show up here."
                : `${name.split(/\s+/)[0]} hasn't followed anyone yet.`}
            </p>
          ) : (
            <div className="dislist">
              {coaches.map((c) => (
                <div key={c.id} className="disrow">
                  <a className="disrow-main" href={`/${c.handle}`}>
                    {c.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="disrow-av" src={c.photo} alt="" />
                    ) : (
                      <span
                        className="disrow-av disrow-av-empty"
                        style={{ background: avatarColor(c!) }}
                        aria-hidden="true"
                      >
                        {(c.name.trim().charAt(0) || "?").toUpperCase()}
                      </span>
                    )}
                    <span className="disrow-txt">
                      <span className="nm">{c.name}</span>
                      <span className="sub">
                        {[c.title?.trim(), c.location?.trim()].filter(Boolean).join(" · ") ||
                          `fittlist.co/${c.handle}`}
                      </span>
                    </span>
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

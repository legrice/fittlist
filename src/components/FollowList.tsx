import Link from "next/link";
import { Icon } from "@/components/Icon";
import type { FollowRow } from "@/lib/circles";

/** Two letters, because one does not tell four coaches apart. A local copy
 *  of WeekView's: that module is "use client", and importing a function
 *  value from one into a server component hands back a reference. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const two = (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
  return (two || name.trim().charAt(0) || "?").toUpperCase();
}

/** The Following tab on a profile: everyone this person follows, a row
 *  each, linking to their pages. One component for the member and coach
 *  views, so the row and the empty state cannot drift between them. The
 *  empty state offers the way in only to the owner: a stranger reading
 *  "Find a coach" on somebody else's page is being given homework. */
export function FollowList({
  rows,
  isOwner,
  firstName,
}: {
  rows: FollowRow[];
  isOwner: boolean;
  firstName: string;
}) {
  if (!rows.length) {
    return (
      <div className="empty-block">
        <h2>{isOwner ? "Start by following a coach" : "Not following anyone yet"}</h2>
        <p>
          {isOwner
            ? "Once you follow someone, they show up here."
            : `${firstName} isn’t following anyone.`}
        </p>
        {isOwner && (
          <Link className="btn si folfind" href="/feed">
            Find a coach
          </Link>
        )}
      </div>
    );
  }
  return (
    <div className="folist">
      {rows.map((c) => (
        <Link key={c.id} className="folrow" href={`/${c.handle}`}>
          <span className="folrow-av" style={{ background: c.color }}>
            {c.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.photo} alt="" />
            ) : (
              initialsOf(c.name)
            )}
          </span>
          <span className="folrow-txt">
            <span className="folrow-nm">{c.name}</span>
            {c.title && <span className="folrow-sub">{c.title}</span>}
          </span>
          <span className="folrow-chev">
            <Icon name="chevron_right" size={20} />
          </span>
        </Link>
      ))}
    </div>
  );
}

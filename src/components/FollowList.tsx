import Link from "next/link";
import { PersonRow } from "@/components/DirectoryRows";
import type { FollowRow } from "@/lib/circles";

/** The Following tab on a profile: everyone this person follows, drawn as
 *  the directory's own rows (by Matt's call, pointing at the Discover
 *  sheet) so a person reads the same way everywhere. The class count
 *  stays off here: this list is about who, not how much. The pill is the
 *  easy unfollow on your own list and the follow door on somebody
 *  else's; a signed-out viewer gets plain rows. The empty state offers
 *  the way in only to the owner: a stranger reading "Find a coach" on
 *  somebody else's page is being given homework. */
export function FollowList({
  rows,
  isOwner,
  firstName,
  signedIn,
}: {
  rows: FollowRow[];
  isOwner: boolean;
  firstName: string;
  signedIn: boolean;
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
    <div className="folist-dir">
      {rows.map((c) => (
        <PersonRow
          key={c.id}
          person={c}
          from="profile"
          kindTag={false}
          follow={signedIn}
          weekLine={false}
        />
      ))}
    </div>
  );
}

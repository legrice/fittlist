import Link from "next/link";
import { Icon } from "@/components/Icon";

// Who marked Going on one occurrence, for the coach who owns it. They marked
// it at this coach, so the coach seeing them is what the mark meant; nobody
// else is ever handed this list.
export type RosterPerson = {
  name: string;
  photo: string | null;
  color: string;
  handle: string | null;
};

function Face({ p }: { p: RosterPerson }) {
  return p.photo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="rosterrow-av" src={p.photo} alt="" />
  ) : (
    <span className="rosterrow-av rosterrow-av-empty" style={{ background: p.color }} aria-hidden="true">
      {(p.name.trim().charAt(0) || "?").toUpperCase()}
    </span>
  );
}

export function Roster({ people }: { people: RosterPerson[] }) {
  if (people.length === 0) {
    return <p className="rosternone">Nobody has marked Going for this one yet.</p>;
  }
  return (
    <div className="roster">
      {people.map((p, i) =>
        p.handle ? (
          <Link key={i} className="rosterrow" href={`/${p.handle}`}>
            <Face p={p} />
            <span className="rosterrow-nm">{p.name}</span>
            <span className="rosterrow-chev">
              <Icon name="chevron_right" size={16} />
            </span>
          </Link>
        ) : (
          <div key={i} className="rosterrow">
            <Face p={p} />
            <span className="rosterrow-nm">{p.name}</span>
          </div>
        ),
      )}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { PersonRow, StudioRow, type DirPerson, type DirStudio } from "@/components/DirectoryRows";

// The directory, which has two halves: the people and the places. Members
// list alongside coaches now (a directory with everyone in it is what says
// the room is lived-in), and the Coach badge on a row is what tells them
// apart. The box is a door to the universal
// search; the tabs pick a half; and the chip rail under them is the whole
// filter: All leads, filled in by default (the one selected chip is what
// says the others can be selected). On People the chips are the kinds
// (Coaches, Members); on Studios they are the place's types. The
// Filters sheet is gone for now; it returns when there are enough
// filters to need one.
export function DiscoverList({
  people,
  studios = [],
  cities,
  myCity = null,
  backHref,
  hideBack = false,
}: {
  people: DirPerson[];
  studios?: DirStudio[];
  cities: string[];
  /** The viewer's own city, which is what "near you" means for now. */
  myCity?: string | null;
  backHref: string;
  hideBack?: boolean;
}) {
  const [tab, setTab] = useState<"people" | "studios">("people");
  // Nothing on by default. Opening Discover should show the whole directory;
  // a filter you didn't set is a list you can't explain, and the count on the
  // Filters chip would be reporting a choice nobody made.
  void myCity;
  // The city filter left with the Filters sheet for now; `cities` stays a
  // prop so it can come back the day there are enough filters to need a
  // sheet again.
  void cities;
  const [types, setTypes] = useState<Set<string>>(new Set());
  // Which kinds of people: multiselect, so both picked means the same as
  // neither. The discipline chips left this half for now; the kinds are the
  // filter, and the type vocabulary stays the studios'.
  const [kinds, setKinds] = useState<Set<"coach" | "member">>(new Set());

  const toggleType = (t: string) =>
    setTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  const toggleKind = (k: "coach" | "member") =>
    setKinds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const shown = useMemo(() => {
    return people.filter((c) => kinds.size === 0 || kinds.has(c.kind));
  }, [people, kinds]);

  // Studios have no city column, only a free-text address, so there is nothing
  // honest to filter them by yet. The address carries the town, and searching
  // it finds them.
  const shownStudios = useMemo(() => {
    return studios.filter((st) => {
      // One vocabulary across the directory, so the same pick narrows both
      // halves: the yoga teachers, and the places that offer yoga.
      if (types.size > 0 && !st.types.some((t) => types.has(t))) return false;
      return true;
    });
  }, [studios, types]);

  // All is the absence of picks, and it leads the rail already filled in:
  // the one selected chip is what says the others can be selected.
  const allOn = tab === "people" ? kinds.size === 0 : types.size === 0;
  const clearAll = () => {
    setTypes(new Set());
    setKinds(new Set());
  };
  // What the lens in front of you can actually be narrowed by, and nothing
  // else: the studios' own type vocabulary, on the Studios half only.
  const disciplines = useMemo(() => {
    const seen = new Set<string>();
    if (tab === "studios") for (const st of studios) for (const t of st.types) seen.add(t);
    return [...seen].sort((a, b) => a.localeCompare(b));
  }, [studios, tab]);

  return (
    <>
      {/* The box first, because searching is the thing people came to do. It
          is a door now, not a filter: tapping it opens the universal search,
          which covers both halves at once and the people you follow besides.
          Two search behaviours behind one drawing of a box was the confusing
          part; the magnifier left the header for this tab, so this is the one
          place searching starts. */}
      <div className="dissearchrow">
        <Link className="dissearch dissearch-door" href="/search" aria-label="Search fittlist">
          <Icon name="search" size={19} className="dissearch-ic" />
          <span className="dissearch-ph">Search</span>
        </Link>
      </div>

      {/* No page title: the tab bar already says Discover. The halves are
          underline tabs, the same drawing a profile's sections wear, and the
          chips ride under them: search, tabs, chips, one stack across the
          top, so every filter is in sight rather than behind a floating
          pill. */}
      <div className="pubtabs distabs" aria-label="Discover sections">
        <button
          className={`pubtab${tab === "people" ? " sel" : ""}`}
          aria-current={tab === "people" ? "page" : undefined}
          onClick={() => {
            setTab("people");
            setTypes(new Set());
          }}
        >
          People
        </button>
        <button
          className={`pubtab${tab === "studios" ? " sel" : ""}`}
          aria-current={tab === "studios" ? "page" : undefined}
          onClick={() => {
            setTab("studios");
            setTypes(new Set());
            setKinds(new Set());
          }}
        >
          Studios
        </button>
      </div>

      {/* All leads the rail on both halves, filled in by default: the one
          selected chip is the hint that the rest can be selected. The chips
          after it are multiselect, and All is the way back. There is no
          Filters sheet for now; it returns when there are enough filters to
          need one. */}
      <div className="dischips" aria-label="Filters">
        <button
          type="button"
          className={`chip${allOn ? " sel" : ""}`}
          aria-pressed={allOn}
          onClick={clearAll}
        >
          All
        </button>
        {tab === "people" && (
          <>
            <button
              type="button"
              className={`chip${kinds.has("coach") ? " sel" : ""}`}
              aria-pressed={kinds.has("coach")}
              onClick={() => toggleKind("coach")}
            >
              Coaches
            </button>
            <button
              type="button"
              className={`chip${kinds.has("member") ? " sel" : ""}`}
              aria-pressed={kinds.has("member")}
              onClick={() => toggleKind("member")}
            >
              Members
            </button>
          </>
        )}
        {disciplines.map((d) => (
          <button
            key={d}
            type="button"
            className={`chip${types.has(d) ? " sel" : ""}`}
            aria-pressed={types.has(d)}
            onClick={() => toggleType(d)}
          >
            {d}
          </button>
        ))}
      </div>

      {tab === "studios" ? (
        shownStudios.length === 0 ? (
          <div className="empty-block">
            <h2>No studios yet</h2>
            <p>Studios arrive as coaches add the places they teach.</p>
          </div>
        ) : (
          <div className="dislist dislist-bare">
            {shownStudios.map((st) => (
              <StudioRow key={st.id} studio={st} from="discover" />
            ))}
          </div>
        )
      ) : (
      <>


      {shown.length === 0 ? (
        <div className="empty-block">
          <h2>Nobody here yet</h2>
          <p>The list fills up as people join.</p>
        </div>
      ) : (
        <div className="dislist dislist-bare">
          {/* Mixed kinds now, so the Coach badge is the distinction that
              matters, same as search. */}
          {shown.map((c) => (
            <PersonRow key={c.id} person={c} from="discover" />
          ))}
        </div>
      )}
      </>
      )}

      {/* Coaches have the bottom nav; fans need a way back. */}
      {!hideBack && (
        <Link className="logoutbtn" href={backHref}>
          Back to your week
        </Link>
      )}
    </>
  );
}

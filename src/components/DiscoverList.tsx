"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { PersonRow, StudioRow, type DirPerson, type DirStudio } from "@/components/DirectoryRows";

// Search over the directory, which has two halves: the people and the places.
// The box is a door to the universal search; the tabs pick a half; and the
// chip rail under them is where filtering lives now. The first chip is
// Filters, which opens the sheet holding everything (the city, and whatever
// studios grow later); the chips after it are the reach-for narrowings in the
// open. Every chip is multiselect: picking Yoga and Pilates means either, and
// the count on the Filters chip adds up as picks accumulate, so you can see
// filters are on without opening anything.
export function DiscoverList({
  coaches,
  studios = [],
  cities,
  myCity = null,
  backHref,
  hideBack = false,
}: {
  coaches: DirPerson[];
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
  const [city, setCity] = useState<string | null>(null);
  // Which kind of person: coach, member, either. Multiselect, so both on is
  // the same list as both off, which keeps the toggle harmless.
  const [kinds, setKinds] = useState<Set<"coach" | "fan">>(new Set());
  const [types, setTypes] = useState<Set<string>>(new Set());
  const [acceptingOnly, setAcceptingOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const toggleKind = (k: "coach" | "fan") =>
    setKinds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  const toggleType = (t: string) =>
    setTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });

  const shown = useMemo(() => {
    return coaches.filter((c) => {
      if (kinds.size > 0 && !kinds.has(c.kind === "coach" ? "coach" : "fan")) return false;
      if (city && c.location !== city) return false;
      // Multiselect means any-of: two picks widen to either, they don't
      // demand both.
      if (types.size > 0 && !c.disciplines.some((d) => types.has(d))) return false;
      // Someone looking for a personal trainer is looking for a yes, not a
      // waitlist. The coach already told us which they are.
      if (acceptingOnly && c.availability !== "accepting") return false;
      return true;
    });
  }, [coaches, city, kinds, types, acceptingOnly]);

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

  // Every live pick counts once, so the badge on Filters is the number of
  // things you'd have to switch off to get the whole list back.
  const activeCount =
    types.size +
    (tab === "people" ? (city ? 1 : 0) + kinds.size + (acceptingOnly ? 1 : 0) : 0);
  const clearAll = () => {
    setCity(null);
    setKinds(new Set());
    setTypes(new Set());
    setAcceptingOnly(false);
  };
  // What the lens in front of you can actually be narrowed by, and nothing
  // else. Pooling both halves offered People the studios' vocabulary, so every
  // chip there filtered to nobody: coaches haven't started saying what they
  // teach yet. The section appears on its own the day they do.
  const disciplines = useMemo(() => {
    const seen = new Set<string>();
    if (tab === "people") for (const c of coaches) for (const d of c.disciplines) seen.add(d);
    else for (const st of studios) for (const t of st.types) seen.add(t);
    return [...seen].sort((a, b) => a.localeCompare(b));
  }, [coaches, studios, tab]);
  // The kind chips only exist when the list mixes kinds: all coaches leaves
  // them nothing to do.
  const mixedKinds = coaches.some((c) => c.kind !== "coach");

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
          }}
        >
          Studios
        </button>
      </div>

      {/* Filters leads the rail on both halves: it opens the sheet holding
          everything, and wears the count of every live pick. The chips after
          it are the same filters in the open, one tap each. */}
      <div className="dischips" aria-label="Filters">
        <button
          type="button"
          className="chip chip-filters"
          onClick={() => setFiltersOpen(true)}
        >
          <Icon name="tune" size={14} />
          Filters
          {activeCount > 0 && <span className="chip-n">{activeCount}</span>}
        </button>
        {tab === "people" && mixedKinds && (
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
              className={`chip${kinds.has("fan") ? " sel" : ""}`}
              aria-pressed={kinds.has("fan")}
              onClick={() => toggleKind("fan")}
            >
              Members
            </button>
          </>
        )}
        {tab === "people" && (
          <button
            type="button"
            className={`chip${acceptingOnly ? " sel" : ""}`}
            aria-pressed={acceptingOnly}
            onClick={() => setAcceptingOnly((v) => !v)}
          >
            Available for clients
          </button>
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

      {filtersOpen && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setFiltersOpen(false);
          }}
        >
          <div className="sheet">
            <button
              className="iconbtn sheetclose"
              aria-label="Close"
              onClick={() => setFiltersOpen(false)}
            >
              <Icon name="close" size={16} />
            </button>
            <h2>Filters</h2>

            {/* A studio has a free-text address and nothing normalised to
                group by, so the city only narrows people. */}
            {tab === "people" && cities.length > 1 && (
              <>
                <label className="flabel" htmlFor="disCity">
                  Where
                </label>
                <select
                  id="disCity"
                  className="editinput"
                  value={city ?? ""}
                  onChange={(e) => setCity(e.target.value || null)}
                >
                  <option value="">Anywhere</option>
                  {cities.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </>
            )}

            {/* The same chips as the rail, in a grid instead of a scroll: the
                sheet is the one place holding every filter, so the rail's
                picks show here too and either place can change them. */}
            {disciplines.length > 0 && (
              <>
                <label className="flabel">{tab === "people" ? "What they teach" : "What it offers"}</label>
                <div className="typepick">
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
              </>
            )}

            {tab === "people" && (
              <div className="settingslist disfilterlist">
                <button
                  className="setrow"
                  role="switch"
                  aria-checked={acceptingOnly}
                  onClick={() => setAcceptingOnly((v) => !v)}
                >
                  <span className="setrow-ic">
                    <Icon name="event_available" size={22} />
                  </span>
                  <span className="setrow-txt">
                    <span className="t">Taking new clients</span>
                    <span className="s">Coaches with room for private sessions</span>
                  </span>
                  <span className={`switch${acceptingOnly ? " on" : ""}`} aria-hidden="true">
                    <span className="switch-knob" />
                  </span>
                </button>
                {mixedKinds && (
                  <>
                    <button
                      className="setrow"
                      role="switch"
                      aria-checked={kinds.has("coach")}
                      onClick={() => toggleKind("coach")}
                    >
                      <span className="setrow-ic">
                        <Icon name="person_add" size={22} />
                      </span>
                      <span className="setrow-txt">
                        <span className="t">Coaches</span>
                        <span className="s">People who publish a schedule</span>
                      </span>
                      <span className={`switch${kinds.has("coach") ? " on" : ""}`} aria-hidden="true">
                        <span className="switch-knob" />
                      </span>
                    </button>
                    <button
                      className="setrow"
                      role="switch"
                      aria-checked={kinds.has("fan")}
                      onClick={() => toggleKind("fan")}
                    >
                      <span className="setrow-ic">
                        <Icon name="groups" size={22} />
                      </span>
                      <span className="setrow-txt">
                        <span className="t">Members</span>
                        <span className="s">People who train</span>
                      </span>
                      <span className={`switch${kinds.has("fan") ? " on" : ""}`} aria-hidden="true">
                        <span className="switch-knob" />
                      </span>
                    </button>
                  </>
                )}
              </div>
            )}

            <div className="publishwrap nostick">
              <button className="btn si" onClick={() => setFiltersOpen(false)}>
                Show {tab === "people" ? shown.length : shownStudios.length}
              </button>
            </div>
            {/* Always in the layout, invisible until it has work: appearing
                and disappearing changed the sheet's height, which made the
                whole sheet jump the moment a switch was toggled. */}
            <button
              className="tertiary tellsheet-done"
              onClick={clearAll}
              disabled={activeCount === 0}
              style={activeCount === 0 ? { visibility: "hidden" } : undefined}
            >
              Clear filters
            </button>
          </div>
        </div>
      )}

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
          <h2>{city ? `Nobody in ${city} yet` : "Nobody here yet"}</h2>
          <p>
            {city
              ? "Nobody is listed there. Switch to All cities to see everyone."
              : "The list fills up as people join and coaches publish their schedules."}
          </p>
          {city && (
            <button className="btn ghost" onClick={() => setCity(null)}>
              Show all cities
            </button>
          )}
        </div>
      ) : (
        <div className="dislist dislist-bare">
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

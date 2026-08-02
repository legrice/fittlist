"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { PersonRow, StudioRow, type DirPerson, type DirStudio } from "@/components/DirectoryRows";

// Search over the directory, which has two halves: the people and the places.
// One search box and one filter on a single row, and the tab above decides
// what they're searching. The corner control follows from the row; the row's
// main job is still to get you to a person, and the Coach badge across from
// the name is what tells you who you're looking at, which is the distinction
// that matters once members can appear in a list.
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
  const [coachesOnly, setCoachesOnly] = useState(false);
  // Nothing on by default. Opening Discover should show the whole directory;
  // a filter you didn't set is a list you can't explain, and the count on the
  // pill would be reporting a choice nobody made.
  void myCity;
  const [city, setCity] = useState<string | null>(null);
  const [discipline, setDiscipline] = useState<string | null>(null);
  const [acceptingOnly, setAcceptingOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const shown = useMemo(() => {
    return coaches.filter((c) => {
      if (coachesOnly && c.kind !== "coach") return false;
      if (city && c.location !== city) return false;
      if (discipline && !c.disciplines.includes(discipline)) return false;
      // Someone looking for a personal trainer is looking for a yes, not a
      // waitlist. The coach already told us which they are.
      if (acceptingOnly && c.availability !== "accepting") return false;
      return true;
    });
  }, [coaches, city, coachesOnly, discipline, acceptingOnly]);

  // Studios have no city column, only a free-text address, so there is nothing
  // honest to filter them by yet. The address carries the town, and searching
  // it finds them.
  const shownStudios = useMemo(() => {
    return studios.filter((st) => {
      // One vocabulary across the directory, so the same pick narrows both
      // halves: the yoga teachers, and the places that offer yoga.
      if (discipline && !st.types.includes(discipline)) return false;
      return true;
    });
  }, [studios, discipline]);

  // Only what this lens can actually narrow, so the sheet never offers a
  // filter that would empty the list on principle.
  const activeCount =
    (tab === "studios" ? 0 : city ? 1 : 0) +
    (discipline ? 1 : 0) +
    (tab === "people" && coachesOnly ? 1 : 0) +
    (tab === "people" && acceptingOnly ? 1 : 0);
  const clearAll = () => {
    setCity(null);
    setDiscipline(null);
    setCoachesOnly(false);
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

  return (
    <>
      {/* The page title, with the coaches-only switch directly across from
          it. Only when the list mixes kinds; all coaches leaves the switch
          nothing to do. */}
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
          underline tabs now, the same drawing a profile's sections wear, and
          the quick chips ride under them: search, tabs, chips, one stack
          across the top, so the reach-for filters are in sight rather than
          behind the sheet. */}
      <div className="pubtabs distabs" aria-label="Discover sections">
        <button
          className={`pubtab${tab === "people" ? " sel" : ""}`}
          aria-current={tab === "people" ? "page" : undefined}
          onClick={() => {
            setTab("people");
            setDiscipline(null);
          }}
        >
          People
        </button>
        <button
          className={`pubtab${tab === "studios" ? " sel" : ""}`}
          aria-current={tab === "studios" ? "page" : undefined}
          onClick={() => {
            setTab("studios");
            setDiscipline(null);
          }}
        >
          Studios
        </button>
      </div>

      {/* The one-tap narrowing, in the open: what this lens can be narrowed
          by, scrolling off the edge. The sheet keeps the rest (the city, the
          switches); a chip you can see is a chip you use. */}
      {disciplines.length > 0 && (
        <div className="dischips" aria-label="Filter by type">
          {disciplines.map((d) => (
            <button
              key={d}
              type="button"
              className={`chip${discipline === d ? " sel" : ""}`}
              aria-pressed={discipline === d}
              onClick={() => setDiscipline(discipline === d ? null : d)}
            >
              {d}
            </button>
          ))}
        </div>
      )}

      {/* The same floating pill a class uses for Book and Add: the one thing
          you reach for over a long list, in the place your thumb already is. */}
      <button
        type="button"
        className="classoverlay-cta disfilterpill"
        onClick={() => setFiltersOpen(true)}
      >
        <span className="ovcta-btn">
          <Icon name="tune" size={17} />
          Filter {tab === "people" ? "people" : "studios"}
          {activeCount > 0 && <span className="disfilterpill-n">{activeCount}</span>}
        </span>
      </button>

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
                {coaches.some((c) => c.kind !== "coach") && (
                  <button
                    className="setrow"
                    role="switch"
                    aria-checked={coachesOnly}
                    onClick={() => setCoachesOnly((v) => !v)}
                  >
                    <span className="setrow-ic">
                      <Icon name="person_add" size={22} />
                    </span>
                    <span className="setrow-txt">
                      <span className="t">Coaches only</span>
                      <span className="s">Hide members from the list</span>
                    </span>
                    <span className={`switch${coachesOnly ? " on" : ""}`} aria-hidden="true">
                      <span className="switch-knob" />
                    </span>
                  </button>
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

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
  const [q, setQ] = useState("");
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
    const needle = q.trim().toLowerCase();
    return coaches.filter((c) => {
      if (coachesOnly && c.kind !== "coach") return false;
      if (city && c.location !== city) return false;
      if (discipline && !c.disciplines.includes(discipline)) return false;
      // Someone looking for a personal trainer is looking for a yes, not a
      // waitlist. The coach already told us which they are.
      if (acceptingOnly && c.availability !== "accepting") return false;
      if (!needle) return true;
      return (
        c.name.toLowerCase().includes(needle) ||
        c.title.toLowerCase().includes(needle) ||
        c.location.toLowerCase().includes(needle)
      );
    });
  }, [coaches, q, city, coachesOnly, discipline, acceptingOnly]);

  // Studios have no city column, only a free-text address, so there is nothing
  // honest to filter them by yet. The address carries the town, and searching
  // it finds them.
  const shownStudios = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return studios.filter((st) => {
      // One vocabulary across the directory, so the same pick narrows both
      // halves: the yoga teachers, and the places that offer yoga.
      if (discipline && !st.types.includes(discipline)) return false;
      if (!needle) return true;
      return (
        st.name.toLowerCase().includes(needle) ||
        st.address.toLowerCase().includes(needle) ||
        st.types.some((t) => t.toLowerCase().includes(needle))
      );
    });
  }, [studios, q, discipline]);

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
      {/* The box first, because searching is the thing people came to do, and
          it searches whichever half the toggle below it is on. */}
      <div className="dissearchrow">
        <div className="dissearch">
          <Icon name="search" size={19} className="dissearch-ic" />
          <input
            className="dissearch-in"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search"
            aria-label={tab === "people" ? "Search people" : "Search studios"}
          />
          {q && (
            <button
              type="button"
              className="dissearch-x"
              onClick={() => setQ("")}
              aria-label="Clear"
            >
              <Icon name="close" size={17} />
            </button>
          )}
        </div>
      </div>

      {/* No page title: the tab bar already says Discover, and the segment
          says which half you're in. */}
      <div className="seg disseg">
        <button
          className={tab === "people" ? "sel" : ""}
          onClick={() => {
            setTab("people");
            setDiscipline(null);
          }}
        >
          People
        </button>
        <button
          className={tab === "studios" ? "sel" : ""}
          onClick={() => {
            setTab("studios");
            setDiscipline(null);
          }}
        >
          Studios
        </button>
      </div>

      {/* The same floating pill a class uses for Book and Save: the one thing
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

            {disciplines.length > 0 && (
              <>
                <label className="flabel">
                  What <span>· one thing, so the list still says something</span>
                </label>
                <div className="typepick">
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
            {activeCount > 0 && (
              <button className="tertiary tellsheet-done" onClick={clearAll}>
                Clear filters
              </button>
            )}
          </div>
        </div>
      )}

      {tab === "studios" ? (
        shownStudios.length === 0 ? (
          <div className="empty-block">
            <h2>{q ? "No studios match that" : "No studios yet"}</h2>
            <p>
              {q
                ? "Try another name or town."
                : "Studios arrive as coaches add the places they teach."}
            </p>
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
          <h2>{city && !q ? `Nobody in ${city} yet` : "Nobody here yet"}</h2>
          <p>
            {q
              ? "Nothing matches that. Try another name or city."
              : city
                ? "Nobody is listed there. Switch to All cities to see everyone."
                : "The list fills up as people join and coaches publish their schedules."}
          </p>
          {city && !q && (
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

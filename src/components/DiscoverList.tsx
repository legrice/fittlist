"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useBandTop } from "@/components/CalendarBits";
import { ClassResults } from "@/components/ClassResults";
import { Icon } from "@/components/Icon";
import { PersonRow, StudioRow, type DirPerson, type DirStudio } from "@/components/DirectoryRows";
import type { DirClass } from "@/lib/discoverclasses";

// The date ranges the Classes half offers, every one a slice of the
// fortnight the server already sent, so picking one is instant. "Pick a
// date" is deliberately not here yet: a date past the window would need a
// round trip, and a dropdown that can't honour one of its own rows is
// worse than a shorter dropdown.
type RangeId = "7" | "today" | "tomorrow" | "weekend" | "14";
const RANGES: { id: RangeId; label: string }[] = [
  { id: "14", label: "Next 14 days" },
  { id: "7", label: "Next 7 days" },
  { id: "today", label: "Today" },
  { id: "tomorrow", label: "Tomorrow" },
  { id: "weekend", label: "This weekend" },
];

/**
 * The fortnight leads, for now.
 *
 * A week is the right default for a directory that is full, and this one
 * isn't yet: at today's density a seven-day window can show a handful of
 * classes and read as a room with nobody in it, which is the wrong first
 * impression to give somebody who just arrived. The fortnight is the whole
 * window the page already loads, so it costs nothing to show. This goes back
 * to "7" once a day reliably holds a hundred of them.
 */
const DEFAULT_RANGE: RangeId = "14";

/** Which of the directory's three halves is in front of you. */
export type DiscoverHalf = "classes" | "coaches" | "studios";

// The directory, which has three halves: the classes, the coaches and the
// places. The box is a door to the universal search; the tabs pick a half;
// and the chip rail under two of them is the whole filter: All leads,
// filled in by default (the one selected chip is what says the others can
// be selected). On Coaches the chips are what they teach, on Studios what
// the place offers, and both come from one vocabulary so the same word
// means the same thing on either. Classes brings its own two dropdowns
// instead. The Filters sheet is gone for now; it returns when there are
// enough filters to need one.
//
// Members left this half when Classes arrived. They were listed to make
// the room look lived-in, and a directory with real classes on it does
// that honestly; a coach directory that is half people who teach nothing
// is a worse answer to "who can I train with". Nobody is hidden: search
// covers both kinds, and Home's people rail still mixes them.
export function DiscoverList({
  people,
  studios = [],
  classes = [],
  todayIso,
  cities,
  myCity = null,
  backHref,
  hideBack = false,
  startHalf = "classes",
}: {
  people: DirPerson[];
  studios?: DirStudio[];
  /** Every listable occurrence in the next fortnight, in time order. */
  classes?: DirClass[];
  /** The app's today, from the app's clock, for the range slices. */
  todayIso: string;
  cities: string[];
  /** The viewer's own city, which is what "near you" means for now. */
  myCity?: string | null;
  backHref: string;
  hideBack?: boolean;
  /** Which half to open on, for a link that means one of them. */
  startHalf?: DiscoverHalf;
}) {
  // The Classes half draws the app's day bands, and they pin. Nothing above
  // this list is sticky except the app header (the search door, the halves
  // and the filters all scroll away), so it publishes the header's height
  // and nothing else. Without this the bands fell back to a guessed offset
  // and pinned halfway down the screen, through the middle of a class row.
  useBandTop();
  // Classes lead, unless somebody was sent to a particular half. "Find
  // coaches" has to land on the coaches, or the button's own word is the
  // one thing the screen it opens isn't showing.
  const [tab, setTab] = useState<DiscoverHalf>(startHalf);
  // The Classes half's own two filters, both dropdowns rather than chips: a
  // date is one answer out of a list, and the types are a long multiselect
  // that would have run off the edge of a rail.
  const [range, setRange] = useState<RangeId>(DEFAULT_RANGE);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [classTypes, setClassTypes] = useState<Set<string>>(new Set());
  // Nothing on by default. Opening Discover should show the whole directory;
  // a filter you didn't set is a list you can't explain, and the count on the
  // Filters chip would be reporting a choice nobody made.
  void myCity;
  // The city filter left with the Filters sheet for now; `cities` stays a
  // prop so it can come back the day there are enough filters to need a
  // sheet again.
  void cities;
  const [types, setTypes] = useState<Set<string>>(new Set());


  // A tap anywhere else closes an open dropdown, the way the mini calendar's
  // scrim does. Two of them open at once would be two answers to one row.
  const closeMenus = () => {
    setRangeOpen(false);
    setTypeOpen(false);
  };
  const toggleClassType = (v: string) =>
    setClassTypes((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
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
    return people
      .filter((c) => c.kind === "coach")
      .filter((c) => types.size === 0 || c.disciplines.some((d) => types.has(d)));
  }, [people, types]);

  // Which dates the picked range covers. Everything is a slice of the
  // fortnight already in hand, so this is a pair of bounds and nothing more.
  const [fromIso, toIso] = useMemo(() => {
    const day = (n: number) => {
      const d = new Date(`${todayIso}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + n);
      return d.toISOString().slice(0, 10);
    };
    if (range === "today") return [todayIso, todayIso];
    if (range === "tomorrow") return [day(1), day(1)];
    if (range === "weekend") {
      // The Saturday and Sunday coming, and today when today is one of them:
      // "this weekend" on a Saturday means today, not next week.
      const dow = new Date(`${todayIso}T00:00:00Z`).getUTCDay(); // 0 Sun .. 6 Sat
      if (dow === 6) return [todayIso, day(1)];
      if (dow === 0) return [todayIso, todayIso];
      return [day(6 - dow), day(7 - dow)];
    }
    return [todayIso, day(range === "14" ? 13 : 6)];
  }, [range, todayIso]);

  const shownClasses = useMemo(
    () =>
      classes.filter(
        (c) =>
          c.iso >= fromIso &&
          c.iso <= toIso &&
          (classTypes.size === 0 || (c.classType ? classTypes.has(c.classType) : false)),
      ),
    [classes, fromIso, toIso, classTypes],
  );

  // A filter is only offered where it can narrow something: the types the
  // fortnight actually holds, not the whole vocabulary.
  const classTypeOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const c of classes) if (c.classType) seen.add(c.classType);
    return [...seen].sort((a, b) => a.localeCompare(b));
  }, [classes]);

  // The row the Agenda hands back is the shared shape, so the ribbon's
  // source (whose it is, whether it's already in) is looked up by key.
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
  const allOn = types.size === 0;
  const clearAll = () => setTypes(new Set());
  // What the lens in front of you can actually be narrowed by, and nothing
  // else: the studios' own type vocabulary, on the Studios half only.
  const disciplines = useMemo(() => {
    const seen = new Set<string>();
    if (tab === "studios") for (const st of studios) for (const t of st.types) seen.add(t);
    if (tab === "coaches")
      for (const c of people) if (c.kind === "coach") for (const d of c.disciplines) seen.add(d);
    return [...seen].sort((a, b) => a.localeCompare(b));
  }, [studios, people, tab]);

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
          {/* The door says what the field behind it says: it is drawn as that
              field, and a door whose words change on opening is two doors. */}
          <span className="dissearch-ph">Search classes, studios, or coaches</span>
        </Link>
      </div>

      {/* No page title: the tab bar already says Discover. The halves are
          underline tabs, the same drawing a profile's sections wear, and the
          chips ride under them: search, tabs, chips, one stack across the
          top, so every filter is in sight rather than behind a floating
          pill. */}
      <div className="pubtabs distabs" aria-label="Discover sections">
        <button
          className={`pubtab${tab === "classes" ? " sel" : ""}`}
          aria-current={tab === "classes" ? "page" : undefined}
          onClick={() => {
            setTab("classes");
            closeMenus();
          }}
        >
          Classes
        </button>
        <button
          className={`pubtab${tab === "coaches" ? " sel" : ""}`}
          aria-current={tab === "coaches" ? "page" : undefined}
          onClick={() => {
            setTab("coaches");
            setTypes(new Set());
            closeMenus();
          }}
        >
          Coaches
        </button>
        <button
          className={`pubtab${tab === "studios" ? " sel" : ""}`}
          aria-current={tab === "studios" ? "page" : undefined}
          onClick={() => {
            setTab("studios");
            setTypes(new Set());
            closeMenus();
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
      {tab !== "classes" && (
      <div className="dischips" aria-label="Filters">
        <button
          type="button"
          className={`chip${allOn ? " sel" : ""}`}
          aria-pressed={allOn}
          onClick={clearAll}
        >
          All
        </button>
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
      )}

      {tab === "classes" ? (
        <>
          {/* Two filters and the count they left, on one line. Both open
              bottom sheets rather than dropping a panel: a menu anchored to
              a pill has to guess which edge it can grow off, and the type
              list is long enough to run past the bottom of a phone. A sheet
              has the room and one place to be. */}
          <div className="clsfilters">
            <button
              type="button"
              className={`clspill${rangeOpen ? " open" : ""}`}
              aria-expanded={rangeOpen}
              onClick={() => setRangeOpen(true)}
            >
              {RANGES.find((r) => r.id === range)?.label}
              <Icon name="expand_more" size={16} />
            </button>
            {classTypeOptions.length > 0 && (
              <button
                type="button"
                className={`clspill${classTypes.size ? " picked" : ""}${typeOpen ? " open" : ""}`}
                aria-expanded={typeOpen}
                onClick={() => setTypeOpen(true)}
              >
                Type
                {classTypes.size > 0 && <span className="clscount">{classTypes.size}</span>}
                <Icon name="expand_more" size={16} />
              </button>
            )}
            {/* What the filters left, counted, across from them. No city: the
                directory is one town for now, and a label that never changes
                is furniture. */}
            <span className="clscount-line">
              {shownClasses.length} {shownClasses.length === 1 ? "class" : "classes"}
            </span>
          </div>
          {rangeOpen && (
            <div className="sheet-scrim" onClick={closeMenus}>
              <div className="sheet" onClick={(e) => e.stopPropagation()}>
                <button className="sheetclose" onClick={closeMenus} aria-label="Close">
                  <Icon name="close" size={20} />
                </button>
                <h2>When</h2>
                <div className="settingslist">
                  {RANGES.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      className="clsopt"
                      role="option"
                      aria-selected={range === r.id}
                      onClick={() => {
                        setRange(r.id);
                        setRangeOpen(false);
                      }}
                    >
                      <span>{r.label}</span>
                      {range === r.id && <Icon name="check" size={18} className="clsopt-on" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {typeOpen && (
            <div className="sheet-scrim" onClick={closeMenus}>
              <div className="sheet" onClick={(e) => e.stopPropagation()}>
                <button className="sheetclose" onClick={closeMenus} aria-label="Close">
                  <Icon name="close" size={20} />
                </button>
                <h2>Type</h2>
                <div className="settingslist">
                  {classTypeOptions.map((v) => (
                    <button
                      key={v}
                      type="button"
                      className="clsopt"
                      aria-pressed={classTypes.has(v)}
                      onClick={() => toggleClassType(v)}
                    >
                      <span className={`clsbox${classTypes.has(v) ? " on" : ""}`} aria-hidden="true">
                        {classTypes.has(v) && <Icon name="check" size={14} />}
                      </span>
                      <span>{v}</span>
                    </button>
                  ))}
                </div>
                {/* Multiselect needs a way back to none: unpicking six chips
                    one at a time is the filter holding you hostage. Only
                    offered when there is something to clear. */}
                {classTypes.size > 0 && (
                  <button
                    type="button"
                    className="btn ghost clsclear"
                    onClick={() => setClassTypes(new Set())}
                  >
                    Clear all
                  </button>
                )}
              </div>
            </div>
          )}
          {shownClasses.length === 0 ? (
            <div className="empty-block">
              <h2>Nothing in that stretch</h2>
              <p>Try a wider range, or take the type filter off.</p>
            </div>
          ) : (
            <ClassResults classes={shownClasses} todayIso={todayIso} from="discover" />
          )}
        </>
      ) : tab === "studios" ? (
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
          <h2>No coaches here yet</h2>
          <p>The list fills up as coaches put their week on fittlist.</p>
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

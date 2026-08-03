"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useBandTop } from "@/components/CalendarBits";
import { ClassResults } from "@/components/ClassResults";
import { Icon } from "@/components/Icon";
import { PersonRow, StudioRow, type DirPerson, type DirStudio } from "@/components/DirectoryRows";
import type { DirClass } from "@/lib/discoverclasses";

/**
 * The date range filter is gone, and the whole fortnight is what you get.
 *
 * It was five answers in a bottom sheet (Today, Tomorrow, This weekend, Next
 * 7, Next 14) sitting above a list that is already grouped by day and already
 * says which day each group is. A range filter earns itself when a day holds
 * more than a screen; at this density it was a control that mostly removed
 * classes from a directory whose problem is having too few. The list scrolls,
 * and the day bands are the range.
 *
 * When it comes back it comes back as a real date pick against a query, not a
 * slice of a window the page happens to hold, which is the same note
 * `buildDiscoverClasses` carries.
 */

/**
 * The words a rail offers, busiest first.
 *
 * All three halves rank their chips this way, so the rail means the same
 * thing wherever it appears: the ones in front of you are the ones with the
 * most behind them. It counts what is actually on the screen behind the rail
 * (occurrences for classes, coaches for disciplines, studios for types), not
 * the vocabulary, so a word nobody uses is never offered. Ties fall back to
 * the alphabet, which keeps the order stable between renders.
 */
function rankByUse(values: (string | null | undefined)[]): string[] {
  const n = new Map<string, number>();
  for (const v of values) if (v) n.set(v, (n.get(v) ?? 0) + 1);
  return [...n.keys()].sort((a, b) => (n.get(b)! - n.get(a)!) || a.localeCompare(b));
}

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
  // The Classes half's types. A rail like the other two halves wear now,
  // rather than a bottom sheet: the sheet existed because the type list was
  // long enough to run off a rail's edge, and a rail that scrolls sideways
  // answers that without hiding the whole filter behind a tap. Its own state
  // rather than the `types` the other halves share, because the vocabularies
  // are still different lists and a pick can't survive the switch.
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

  const shownClasses = useMemo(
    () =>
      classes.filter(
        (c) => classTypes.size === 0 || (c.classType ? classTypes.has(c.classType) : false),
      ),
    [classes, classTypes],
  );

  // A filter is only offered where it can narrow something: the types the
  // fortnight actually holds, not the whole vocabulary. Busiest first, and
  // that ordering is the rail's whole argument for existing: a rail is read
  // left to right and only the first few are seen without a swipe, so the
  // ones worth seeing are the ones with the most behind them. Alphabetical
  // would put Barre in front of Yoga for no reason anybody could name.
  const classTypeOptions = useMemo(
    () => rankByUse(classes.map((c) => c.classType)),
    [classes],
  );

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
    if (tab === "studios") return rankByUse(studios.flatMap((st) => st.types));
    if (tab === "coaches")
      return rankByUse(people.filter((c) => c.kind === "coach").flatMap((c) => c.disciplines));
    return [];
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
          onClick={() => setTab("classes")}
        >
          Classes
        </button>
        <button
          className={`pubtab${tab === "coaches" ? " sel" : ""}`}
          aria-current={tab === "coaches" ? "page" : undefined}
          onClick={() => {
            setTab("coaches");
            setTypes(new Set());
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
          }}
        >
          Studios
        </button>
      </div>

      {/* One rail, all three halves. All leads it, filled in by default: the
          one selected chip is the hint that the rest can be selected. The
          chips after it are multiselect and busiest first, and All is the way
          back, which is why there is no Clear all anywhere. Classes had two
          bottom sheets here instead; a sheet is a tap that hides the whole
          filter, and the answer to a long type list is a rail that scrolls. */}
      {(tab === "classes" ? classTypeOptions.length > 0 : disciplines.length > 0) && (
        <div className="dischips" aria-label="Filters">
          <button
            type="button"
            className={`chip${(tab === "classes" ? classTypes.size === 0 : allOn) ? " sel" : ""}`}
            aria-pressed={tab === "classes" ? classTypes.size === 0 : allOn}
            onClick={() => (tab === "classes" ? setClassTypes(new Set()) : clearAll())}
          >
            All
          </button>
          {(tab === "classes" ? classTypeOptions : disciplines).map((d) => {
            const on = tab === "classes" ? classTypes.has(d) : types.has(d);
            return (
              <button
                key={d}
                type="button"
                className={`chip${on ? " sel" : ""}`}
                aria-pressed={on}
                onClick={() => (tab === "classes" ? toggleClassType(d) : toggleType(d))}
              >
                {d}
              </button>
            );
          })}
        </div>
      )}

      {tab === "classes" ? (
        <>
          {shownClasses.length === 0 ? (
            <div className="empty-block">
              <h2>Nothing of that kind</h2>
              <p>Tap All to see every class coming up.</p>
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

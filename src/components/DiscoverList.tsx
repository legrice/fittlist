"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useBandTop } from "@/components/CalendarBits";
import { Icon } from "@/components/Icon";
import type { DirPerson, DirStudio } from "@/components/DirectoryRows";
import { RowFollow } from "@/components/RowFollow";
import type { DirClass } from "@/lib/discoverclasses";

// The class agenda is the heaviest of Explore's three views. Keep it out of
// the initial Coaches bundle and request it only when the Classes route is in
// front of somebody.
const ClassResults = dynamic(
  () => import("@/components/ClassResults").then((module) => module.ClassResults),
  { loading: () => <div className="discover-inline-loading">Loading classes…</div> },
);

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
type DiscoverFilter = "when" | "type" | "location";
const NEAR_ME = "__near_me__";

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
  startHalf = "coaches",
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
  // Coaches lead, per the Discover spec: a follow is what makes every other
  // surface work (Following, Activity and Home's Upcoming are all empty until
  // one happens), so the act that unlocks the app is one tap from opening the
  // tab. Anything whose own word names a different half has to deep-link past
  // this, or the button contradicts the screen it opens.
  const tab = startHalf;
  const [query, setQuery] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [classRange, setClassRange] = useState<"all" | "today" | "tomorrow" | "weekend" | "7">("all");
  const [filterMenu, setFilterMenu] = useState<DiscoverFilter | null>(null);
  // The active directory lives in the URL. Each route now fetches only its
  // own inventory, so Coaches never waits for hidden Classes or Studios data.
  // The Classes half's types. A rail like the other two halves wear now,
  // rather than a bottom sheet: the sheet existed because the type list was
  // long enough to run off a rail's edge, and a rail that scrolls sideways
  // answers that without hiding the whole filter behind a tap. Its own state
  // rather than the `types` the other halves share, because the vocabularies
  // are still different lists and a pick can't survive the switch.
  // Nothing on by default. Opening Discover should show the whole directory;
  // a filter you didn't set is a list you can't explain, and the count on the
  // Filters chip would be reporting a choice nobody made.
  const effectiveCity = selectedCity === NEAR_ME ? (myCity ?? "") : selectedCity;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people
      .filter((c) => c.kind === "coach")
      .filter(
        (c) =>
          !q ||
          c.name.toLowerCase().includes(q) ||
          c.title.toLowerCase().includes(q) ||
          c.location.toLowerCase().includes(q) ||
          c.disciplines.some((d) => d.toLowerCase().includes(q)),
      )
      .filter((c) => !selectedType || c.disciplines.includes(selectedType))
      .filter((c) => !effectiveCity || c.location.toLowerCase().includes(effectiveCity.toLowerCase()));
  }, [people, query, effectiveCity, selectedType]);

  const rangeBounds = useMemo(() => {
    const day = (offset: number) => {
      const date = new Date(`${todayIso}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() + offset);
      return date.toISOString().slice(0, 10);
    };
    if (classRange === "today") return [todayIso, todayIso] as const;
    if (classRange === "tomorrow") return [day(1), day(1)] as const;
    if (classRange === "7") return [todayIso, day(6)] as const;
    if (classRange === "weekend") {
      const dow = new Date(`${todayIso}T00:00:00Z`).getUTCDay();
      if (dow === 6) return [todayIso, day(1)] as const;
      if (dow === 0) return [todayIso, todayIso] as const;
      return [day(6 - dow), day(7 - dow)] as const;
    }
    return null;
  }, [classRange, todayIso]);

  const shownClasses = useMemo(
    () =>
      classes.filter((c) => {
        const q = query.trim().toLowerCase();
        const matchesQuery =
          !q ||
          c.name.toLowerCase().includes(q) ||
          (c.classType ?? "").toLowerCase().includes(q) ||
          (c.coachName ?? "").toLowerCase().includes(q) ||
          (c.studioName ?? c.where ?? "").toLowerCase().includes(q);
        const matchesRange = !rangeBounds || (c.iso >= rangeBounds[0] && c.iso <= rangeBounds[1]);
        const matchesLocation = !effectiveCity || c.location.toLowerCase().includes(effectiveCity.toLowerCase());
        return matchesQuery && matchesRange && matchesLocation && (!selectedType || c.classType === selectedType);
      }),
    [classes, query, effectiveCity, rangeBounds, selectedType],
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
    const q = query.trim().toLowerCase();
    return studios.filter((st) => {
      if (
        q &&
        !st.name.toLowerCase().includes(q) &&
        !st.address.toLowerCase().includes(q) &&
        !st.types.some((t) => t.toLowerCase().includes(q))
      ) return false;
      // One vocabulary across the directory, so the same pick narrows both
      // halves: the yoga teachers, and the places that offer yoga.
      if (selectedType && !st.types.includes(selectedType)) return false;
      if (effectiveCity && !st.address.toLowerCase().includes(effectiveCity.toLowerCase())) return false;
      return true;
    });
  }, [studios, query, effectiveCity, selectedType]);
  // What the lens in front of you can actually be narrowed by, and nothing
  // else: the studios' own type vocabulary, on the Studios half only.
  const disciplines = useMemo(() => {
    if (tab === "studios") return rankByUse(studios.flatMap((st) => st.types));
    if (tab === "coaches")
      return rankByUse(people.filter((c) => c.kind === "coach").flatMap((c) => c.disciplines));
    return [];
  }, [studios, people, tab]);

  const rangeOptions: { value: typeof classRange; label: string }[] = [
    { value: "all", label: "Any day" },
    { value: "today", label: "Today" },
    { value: "tomorrow", label: "Tomorrow" },
    { value: "weekend", label: "This weekend" },
    { value: "7", label: "Next 7 days" },
  ];
  const rangeLabel = rangeOptions.find((option) => option.value === classRange)?.label ?? "Any day";
  const filterOptions = filterMenu === "when"
    ? rangeOptions
    : filterMenu === "type"
      ? [{ value: "", label: "Any type" }, ...(tab === "classes" ? classTypeOptions : disciplines).map((value) => ({ value, label: value }))]
      : [
          { value: "", label: "Any location" },
          ...(myCity ? [{ value: NEAR_ME, label: "Near me" }] : []),
          ...cities.map((value) => ({ value, label: value })),
        ];
  const filterValue = filterMenu === "when" ? classRange : filterMenu === "type" ? selectedType : selectedCity;
  const filterTitle = filterMenu === "when" ? "When" : filterMenu === "type" ? "Type" : "Location";

  const chooseFilter = (value: string) => {
    if (filterMenu === "when") setClassRange(value as typeof classRange);
    if (filterMenu === "type") setSelectedType(value);
    if (filterMenu === "location") setSelectedCity(value);
    setFilterMenu(null);
  };

  return (
    <>
      <div className="discover-tabs" role="tablist" aria-label="Discover sections">
        <Link
          role="tab"
          className={tab === "coaches" ? "on" : ""}
          aria-selected={tab === "coaches"}
          href="/discover"
          prefetch={false}
        >
          Coaches
        </Link>
        <Link
          role="tab"
          className={tab === "classes" ? "on" : ""}
          aria-selected={tab === "classes"}
          href="/discover?half=classes"
          prefetch={false}
        >
          Classes
        </Link>
        <Link
          role="tab"
          className={tab === "studios" ? "on" : ""}
          aria-selected={tab === "studios"}
          href="/discover?half=studios"
          prefetch={false}
        >
          Studios
        </Link>
      </div>

      <div className="dissearchrow discover-searchrow">
        <label className="dissearch">
          <Icon name="search" size={20} className="dissearch-ic" />
          <input
            className="dissearch-in"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Search ${tab}`}
            aria-label={`Search ${tab}`}
          />
          {query && (
            <button type="button" className="dissearch-x" onClick={() => setQuery("")} aria-label="Clear search">
              <Icon name="close" size={19} />
            </button>
          )}
        </label>
      </div>

      <div className="discover-filterrow" aria-label={`${tab} filters`}>
        {tab === "classes" && (
          <button
            type="button"
            className={`discover-filterpill${classRange !== "all" ? " on" : ""}`}
            onClick={() => setFilterMenu("when")}
          >
            {rangeLabel}
            <Icon name="expand_more" size={17} />
          </button>
        )}
        <button
          type="button"
          className={`discover-filterpill${selectedType ? " on" : ""}`}
          onClick={() => setFilterMenu("type")}
        >
          {selectedType || "Any type"}
          <Icon name="expand_more" size={17} />
        </button>
        {(cities.length > 0 || !!myCity) && (
          <button
            type="button"
            className={`discover-filterpill${selectedCity ? " on" : ""}`}
            onClick={() => setFilterMenu("location")}
          >
            {selectedCity === NEAR_ME ? "Near me" : selectedCity || "Any location"}
            <Icon name="expand_more" size={17} />
          </button>
        )}
      </div>

      {filterMenu && (
        <div className="sheet-scrim" onClick={(event) => { if (event.target === event.currentTarget) setFilterMenu(null); }}>
          <div className="sheet discover-filter-sheet">
            <button className="iconbtn sheetclose" aria-label="Close" onClick={() => setFilterMenu(null)}>
              <Icon name="close" size={18} />
            </button>
            <h2>{filterTitle}</h2>
            <div className="discover-filter-options">
              {filterOptions.map((option) => (
                <button
                  type="button"
                  className="clsopt"
                  key={option.value}
                  onClick={() => chooseFilter(option.value)}
                >
                  <span>{option.label}</span>
                  {option.value === filterValue && <Icon className="clsopt-on" name="check" size={21} />}
                </button>
              ))}
            </div>
          </div>
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
          <div className="discover-studio-grid">
            {shownStudios.map((st, index) => (
              <Link href={`/s/${st.slug}?from=discover`} className="discover-studio-tile" key={st.id}>
                {st.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={st.photo}
                    alt=""
                    loading={index < 4 ? "eager" : "lazy"}
                    fetchPriority={index < 2 ? "high" : "auto"}
                    decoding="async"
                  />
                ) : (
                  <span className="discover-studio-placeholder" style={{ background: st.color }}>
                    {(st.name.trim().charAt(0) || "?").toUpperCase()}
                  </span>
                )}
                <strong>{st.name}</strong>
                <small>{st.types.slice(0, 2).join(" · ") || "Fitness space"}</small>
              </Link>
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
        <div className="discover-person-grid">
          {shown.map((c, index) => (
            <div className="discover-person-tile" key={c.id}>
              <Link href={`/${c.handle}?from=discover`} className="discover-person-main">
                <span className="discover-person-face" style={{ background: c.color }}>
                  {c.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.photo}
                      alt=""
                      loading={index < 4 ? "eager" : "lazy"}
                      fetchPriority={index < 2 ? "high" : "auto"}
                      decoding="async"
                    />
                  ) : (
                    (c.name.trim().charAt(0) || "?").toUpperCase()
                  )}
                </span>
                <strong>{c.name}</strong>
                {c.location && <small className="discover-person-location">{c.location}</small>}
              </Link>
              <RowFollow
                handle={c.handle}
                name={c.name}
                isCoach
                following={c.following}
                requested={c.requested}
              />
            </div>
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

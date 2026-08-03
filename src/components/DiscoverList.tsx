"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Agenda, ClassRow } from "@/components/Agenda";
import { ClassCardActions } from "@/components/ClassCardActions";
import { ClassOpener } from "@/components/ClassOpener";
import { Icon } from "@/components/Icon";
import { PersonRow, StudioRow, type DirPerson, type DirStudio } from "@/components/DirectoryRows";
import { fmtDayHeaderRel } from "@/lib/format";
import type { DirClass } from "@/lib/discoverclasses";

// The date ranges the Classes half offers, every one a slice of the
// fortnight the server already sent, so picking one is instant. "Pick a
// date" is deliberately not here yet: a date past the window would need a
// round trip, and a dropdown that can't honour one of its own rows is
// worse than a shorter dropdown.
type RangeId = "7" | "today" | "tomorrow" | "weekend" | "14";
const RANGES: { id: RangeId; label: string }[] = [
  { id: "7", label: "Next 7 days" },
  { id: "today", label: "Today" },
  { id: "tomorrow", label: "Tomorrow" },
  { id: "weekend", label: "This weekend" },
  { id: "14", label: "Next 14 days" },
];

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
  classes = [],
  todayIso,
  cities,
  myCity = null,
  backHref,
  hideBack = false,
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
}) {
  const [tab, setTab] = useState<"classes" | "people" | "studios">("classes");
  // The Classes half's own two filters, both dropdowns rather than chips: a
  // date is one answer out of a list, and the types are a long multiselect
  // that would have run off the edge of a rail.
  const [range, setRange] = useState<RangeId>("7");
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
  // Which kinds of people: multiselect, so both picked means the same as
  // neither. The discipline chips left this half for now; the kinds are the
  // filter, and the type vocabulary stays the studios'.
  const [kinds, setKinds] = useState<Set<"coach" | "member">>(new Set());

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
  const classByKey = useMemo(
    () => new Map(shownClasses.map((c) => [`${c.classId}|${c.iso}`, c])),
    [shownClasses],
  );

  // One day, one heading: the same grouped list every schedule in the app is.
  const classDays = useMemo(() => {
    const byIso = new Map<string, DirClass[]>();
    for (const c of shownClasses) {
      const arr = byIso.get(c.iso) ?? [];
      arr.push(c);
      byIso.set(c.iso, arr);
    }
    return [...byIso.entries()].map(([iso, items]) => ({ iso, items }));
  }, [shownClasses]);

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
          className={`pubtab${tab === "people" ? " sel" : ""}`}
          aria-current={tab === "people" ? "page" : undefined}
          onClick={() => {
            setTab("people");
            setTypes(new Set());
            closeMenus();
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
      )}

      {tab === "classes" ? (
        <>
          {/* Two dropdowns and a count. A date is one answer out of a list,
              so its menu picks one; the types are a long multiselect, so
              theirs checks many and wears the number it picked. */}
          <div className="clsfilters">
            <div className="clsdrop">
              <button
                type="button"
                className={`clspill${rangeOpen ? " open" : ""}`}
                aria-expanded={rangeOpen}
                onClick={() => {
                  setTypeOpen(false);
                  setRangeOpen((o) => !o);
                }}
              >
                {RANGES.find((r) => r.id === range)?.label}
                <Icon name="expand_more" size={16} />
              </button>
              {rangeOpen && (
                <>
                  <div className="clsdrop-scrim" onClick={closeMenus} aria-hidden="true" />
                  <div className="clsmenu" role="listbox">
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
                </>
              )}
            </div>
            {classTypeOptions.length > 0 && (
              <div className="clsdrop">
                <button
                  type="button"
                  className={`clspill${classTypes.size ? " picked" : ""}${typeOpen ? " open" : ""}`}
                  aria-expanded={typeOpen}
                  onClick={() => {
                    setRangeOpen(false);
                    setTypeOpen((o) => !o);
                  }}
                >
                  Type
                  {classTypes.size > 0 && <span className="clscount">{classTypes.size}</span>}
                  <Icon name="expand_more" size={16} />
                </button>
                {typeOpen && (
                  <>
                    <div className="clsdrop-scrim" onClick={closeMenus} aria-hidden="true" />
                    <div className="clsmenu clsmenu-r">
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
                  </>
                )}
              </div>
            )}
          </div>
          {/* What the filters left, counted. No city: the directory is one
              town for now, and a label that never changes is furniture. */}
          <p className="clscount-line">
            {shownClasses.length} {shownClasses.length === 1 ? "class" : "classes"}
          </p>
          {classDays.length === 0 ? (
            <div className="empty-block">
              <h2>Nothing in that stretch</h2>
              <p>Try a wider range, or take the type filter off.</p>
            </div>
          ) : (
            <ClassOpener handle="">
              <Agenda
                className="callist"
                days={classDays.map((d) => ({
                  iso: d.iso,
                  label: fmtDayHeaderRel(d.iso, todayIso),
                  items: d.items.map((c) => ({
                    key: `${c.classId}|${c.iso}`,
                    name: c.name,
                    hm: c.hm,
                    ap: c.ap,
                    durationMin: c.durationMin,
                    where: c.where,
                    coachName: c.coachName,
                    coachPhoto: c.coachPhoto,
                    coachColor: c.coachColor,
                    href: `/${c.base}/${c.classId}?d=${c.iso}&from=discover`,
                    classId: c.classId,
                    iso: c.iso,
                    base: c.base,
                  })),
                }))}
                row={(item) => {
                  const src = classByKey.get(item.key);
                  return (
                    <>
                      <ClassRow item={item} />
                      {/* The ribbon, the one control a class row carries
                          anywhere. Not for one of your own. */}
                      {src && (
                        <ClassCardActions
                          classId={src.classId}
                          iso={src.iso}
                          name={src.name}
                          canAdd={!src.mine}
                          initialOn={src.added}
                        />
                      )}
                    </>
                  );
                }}
              />
            </ClassOpener>
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

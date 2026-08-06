"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ClassPeek, type PeekClass } from "@/components/ClassPeek";
import { Icon } from "@/components/Icon";
import { initialOf } from "@/lib/avatar";
import { fmtDayHeaderRel } from "@/lib/format";
import { UpcomingDays, WeekEmpty, type WeekDayRows } from "@/components/WeekView";

export type FeedCoach = {
  id: string;
  name: string;
  handle: string;
  photo: string | null;
  color: string;
};

export type FeedItem = {
  key: string;
  /** Which of the three weeks it falls in, decided on the server. */
  week: number;
  iso: string;
  classId: string;
  /** The base its class page lives under: a handle, or `s/{slug}` for a gym. */
  base: string;
  coachId: string;
  name: string;
  where: string | null;
  hm: string;
  ap: string;
  /** For sorting inside a day, since "6:00" sorts badly as a string. */
  mins: number;
};

/**
 * Everyone you follow, as one week.
 *
 * The rail is the filter and the only one there is. Tapping a face narrows the
 * week to that coach; tapping it again, or All, gives everyone back. It is
 * single-select on purpose: a multi-select rail is a set of checkboxes wearing
 * photographs, and the question this screen answers is "what has Nadia got on",
 * which has one subject.
 *
 * There is nothing to save here. A member has no calendar of their own, so a
 * class opens to say when, where and whose, and offers the way to that coach's
 * page. The relationship is reading, not collecting.
 */
export function FollowingScreen({
  items,
  coaches,
  todayIso,
}: {
  items: FeedItem[];
  coaches: FeedCoach[];
  todayIso: string;
}) {
  const [focus, setFocus] = useState<string | null>(null);
  const [peek, setPeek] = useState<PeekClass | null>(null);

  const coachById = useMemo(() => new Map(coaches.map((c) => [c.id, c])), [coaches]);

  // Only the people who actually have something in the range. The rail filters
  // the week, so a face with nothing behind it is a chip that can only ever
  // empty the screen. They stay followed; they are just not on the rail.
  //
  // Across all three weeks rather than the visible one, on purpose. Scoped to
  // the week the rail would rearrange itself every time you tapped an arrow,
  // and a face moving out from under a thumb between taps is worse than a face
  // that is quiet this week: the arrow is right there, and the empty state
  // says so.
  const rail = useMemo(() => {
    const has = new Set(items.map((i) => i.coachId));
    return coaches.filter((c) => has.has(c.id));
  }, [coaches, items]);

  const shown = useMemo(
    () => items.filter((i) => !focus || i.coachId === focus),
    [items, focus],
  );

  const days: WeekDayRows[] = useMemo(() => {
    const byIso = new Map<string, FeedItem[]>();
    for (const i of shown) {
      const list = byIso.get(i.iso) ?? [];
      list.push(i);
      byIso.set(i.iso, list);
    }
    return [...byIso.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([iso, list]) => {
        const d = new Date(`${iso}T00:00:00Z`);
        return {
          iso,
          dow: d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }).toUpperCase(),
          date: String(d.getUTCDate()),
          // "Today", "Tomorrow", then the date. The same words the rest of the
          // app uses for a day, so one day is never named two ways.
          label: fmtDayHeaderRel(iso, todayIso),
          rows: list
            .sort((a, b) => a.mins - b.mins)
            .map((i) => {
              const c = coachById.get(i.coachId);
              return {
                key: i.key,
                name: i.name,
                where: i.where,
                hm: i.hm,
                ap: i.ap,
                coach: c
                  ? { id: c.id, name: c.name, color: c.color, photo: c.photo }
                  : null,
                onTap: () => setPeek(peekOf(i, c ?? null)),
              };
            }),
        };
      });
  }, [shown, coachById, todayIso]);

  // "12 classes from 3 coaches", or their name when the rail is narrowed. It
  // says what is on screen rather than what exists, so it agrees with the list
  // underneath it whichever way the rail is set.
  const summary = (() => {
    if (!rail.length) return null;
    const n = shown.length;
    const cls = `${n} ${n === 1 ? "class" : "classes"}`;
    if (focus) {
      const c = coachById.get(focus);
      return c ? `${cls} from ${c.name}` : cls;
    }
    const people = new Set(shown.map((i) => i.coachId)).size;
    if (!people) return cls;
    return `${cls} from ${people} ${people === 1 ? "coach" : "coaches"}`;
  })();

  // Nobody followed at all is a different screen from a quiet week, and it is
  // the one that matters: this tab is empty until a follow happens, so the
  // empty state is the whole screen and it points at the one way out.
  if (!rail.length) {
    return (
      <>
        {/* Two different nothings, and they want different words. Following
            nobody is a screen with one thing to do; following people who have
            not put anything up is a screen where the app is fine and the week
            is just quiet, and telling somebody to find coaches there would be
            answering a question they did not ask. */}
        <div className="wkempty">
          <h2 className="wkempty-t">
            {coaches.length ? "Nothing up yet" : "You\u2019re not following anyone"}
          </h2>
          <p className="wkempty-b">
            {coaches.length
              ? "The people you follow have not put any classes up. This fills in as they do."
              : "Follow a coach and their week shows up here, beside everyone else you follow."}
          </p>
          <Link className="btn si wkempty-cta" href="/discover">
            Find coaches
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      {/* The rail sits above the chrome and scrolls away with the page: it
          costs its height once, when you open the app. */}
      <div className="tray">
        <div className="tray-scroll">
          <button
            className="trayitem"
            onClick={() => setFocus(null)}
            aria-pressed={focus === null}
          >
            <span className={`trayav trayav-all${focus === null ? " sel" : ""}`}>All</span>
            <span className="trayitem-nm">Everyone</span>
          </button>
          {rail.map((c) => {
            const on = focus === c.id;
            return (
              <button
                key={c.id}
                className={`trayitem${focus && !on ? " dim" : ""}`}
                aria-pressed={on}
                onClick={() => setFocus(on ? null : c.id)}
              >
                <span className={`trayav${on ? " sel" : ""}`}>
                  {c.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.photo} alt="" />
                  ) : (
                    <span className="trayav-ini" style={{ background: c.color }}>
                      {initialOf(c.name)}
                    </span>
                  )}
                </span>
                <span className="trayitem-nm">{c.name.split(/\s+/)[0]}</span>
              </button>
            );
          })}
          {/* The way to lengthen the rail, at the end of it, never one of the
              faces: it keeps its full opacity when a face is picked. */}
          <Link className="trayitem" href="/discover">
            <span className="trayav trayav-add">
              <Icon name="add" size={26} />
            </span>
            <span className="trayitem-nm">Find</span>
          </Link>
        </div>
      </div>

      {/* No week stepper here, on purpose. Your calendar is a week you flip
          through, because you are working on it; this is a list of what is
          coming, because you are reading it and "when can I train next" is not
          a question any week boundary answers. */}
      <div className="wkhead">
        <div className="wkhead-row">
          <h1 className="wkhead-range">Coming up</h1>
        </div>
        {summary && <p className="wkhead-sum">{summary}</p>}
      </div>

      {days.length === 0 ? (
        <WeekEmpty
          first
          title={focus ? "Nothing from them coming up" : "Nothing coming up"}
          body={
            focus
              ? "Tap Everyone to see the rest."
              : "The people you follow have not put anything up yet."
          }
        />
      ) : (
        <UpcomingDays days={days} />
      )}

      {/* Discovery is this button and the plus on the rail, and they open the
          same place. It is not a tab: a directory is somewhere you go
          occasionally, and a tab is somewhere you live. */}
      <Link className="wkfab wkfab-find" aria-label="Find coaches" href="/discover">
        <Icon name="search" size={24} strokeWidth={2.75} />
      </Link>

      {peek && (
        <ClassPeek
          cls={peek}
          onClose={() => setPeek(null)}
          onToast={() => {}}
          onChanged={() => {}}
        />
      )}
    </>
  );
}

/** The tapped occurrence, as the sheet wants it. Somebody else's class, so it
 *  names the coach and offers their week rather than an edit. */
function peekOf(i: FeedItem, coach: FeedCoach | null): PeekClass {
  const d = new Date(`${i.iso}T00:00:00Z`);
  // Title case, because it is a value in the facts list now and reads beside
  // "6:00 pm" and "Ironbound Performance Athletics", not above them.
  const dow = d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  const md = d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return {
    id: i.classId,
    iso: i.iso,
    name: i.name,
    when: `${dow}, ${md}`,
    time: `${i.hm} ${i.ap.toLowerCase()}`,
    studio: i.where,
    coach: coach ? { name: coach.name, handle: coach.handle } : null,
    // Where the depth is loaded from: a handle, or `s/{slug}` for a gym's
    // class, which is why the row carries it rather than the coach doing.
    base: i.base,
    mine: false,
  };
}

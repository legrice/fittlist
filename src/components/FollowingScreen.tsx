"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useBandTop } from "@/components/CalendarBits";
import { ClassPeek, type PeekClass } from "@/components/ClassPeek";
import { ClassRowMenu } from "@/components/ClassRowMenu";
import { CoachPeek } from "@/components/CoachPeek";
import { DiscoverSheet } from "@/components/DiscoverSheet";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";
import { ClassLine, initials, type WeekRow } from "@/components/WeekView";

export type FeedCoach = {
  id: string;
  name: string;
  handle: string;
  photo: string | null;
  color: string;
  /** When their next class is ("Today 6:00p"), under the face on the rail:
   *  the rail answers "who can I train with next" before a single tap. */
  next: string | null;
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
  /** The studio's page, when the class names a studio rather than a room. */
  whereHref: string | null;
  hm: string;
  ap: string;
  durationMin: number;
  /** For sorting inside a day, since "6:00" sorts badly as a string. */
  mins: number;
  /** The sheet's depth, carried on the row so the peek paints whole on its
   *  first frame: the About text arriving a beat late grew the sheet after
   *  it was already up, which reads as a jump. The photo deliberately stays
   *  behind the fetch (legacy images are data URLs, and a feed carrying one
   *  per row is a feed that weighs megabytes). */
  about: string | null;
  classType: string | null;
  links: { label: string; url: string }[];
  /** The studio's street address, the sub-line under the place fact. */
  studioAddress: string | null;
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
  favIds,
  cats,
  follows,
  todayIso,
  meId,
}: {
  items: FeedItem[];
  coaches: FeedCoach[];
  /** Who the viewer favorited: the rail is these and only these. The feed
   *  underneath is everyone, which is what makes this screen Discover. */
  favIds: string[];
  /** The category pills, from what the list actually holds. */
  cats: string[];
  /** How many favorites: the rail's empty state forks on this. */
  follows: number;
  todayIso: string;
  /** The viewer: their own rows (a coach's own week rides this feed) skip
   *  the report row, which could only ever answer with an error. */
  meId?: string;
}) {
  const [focus, setFocus] = useState<string | null>(null);
  const [cat, setCat] = useState<string | null>(null);
  // When in the day, on top of what: before noon, noon to five, five on.
  // A single toggle beside the categories, because "can I train before
  // work" is the other question a list of times gets asked.
  const [time, setTime] = useState<null | "morning" | "afternoon" | "evening">(null);
  // One day at a time now, by Matt's call: the date tabs run left to right
  // and the list under them is that day alone. A three-week scroll of
  // everything was unwieldy in exactly the way a booking app's day rail is
  // not. Lands on today, or the first day that holds anything when today
  // is quiet, which is the same grace the hub's defaultFrom applies.
  const [day, setDay] = useState<string>(() => {
    if (items.some((i) => i.iso === todayIso)) return todayIso;
    let first: string | null = null;
    for (const i of items) if (i.iso > todayIso && (!first || i.iso < first)) first = i.iso;
    return first ?? todayIso;
  });
  // Where the auto-landing went, so the note under the tabs can say why
  // Today isn't selected; it only ever names this one day.
  const landed = useRef(day);
  const [peek, setPeek] = useState<PeekClass | null>(null);
  // A face on the rail opens that coach's fortnight, the peek the v4 tray
  // carried, back per Matt's call with the star riding its head.
  const [peekCoach, setPeekCoach] = useState<FeedCoach | null>(null);
  const [find, setFind] = useState(false);
  // The class sheet's copy fallback speaks through this: it was a no-op
  // for a while, so on a browser with no share tray the link was copied
  // and nothing said so, which reads as a dead button.
  const [toastMsg, toastOn, toast] = useToast();
  const router = useRouter();

  // The bands pin under the app header and nothing else: the coach rail above
  // them scrolls away. `--dayband-top` lives on documentElement, so a screen
  // that draws bands and forgets this inherits whatever the last screen set
  // and pins them halfway down the phone, through the middle of a row. That
  // has shipped once already, on Discover.
  useBandTop();

  // Following somebody in the sheet is the whole reason the sheet exists, and
  // the week behind it is a server render: closing is where it catches up. The
  // action revalidates /feed, but nothing re-renders a page that is already on
  // screen, so without this you would follow three people, close, and find the
  // same empty rail you opened.
  // The tray pins under the header, part of the chrome the card slides over:
  // its sticky top is the pinned header's own height, which is a measured
  // number because the safe area moves it (a constant that has to track a
  // measured thing is a constant that will be wrong again).
  const trayRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = trayRef.current;
    const bar = document.querySelector<HTMLElement>(".brandbar");
    if (!el || !bar) return undefined;
    const set = () => el.style.setProperty("--tray-top", `${bar.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);

  const closeFind = () => {
    setFind(false);
    router.refresh();
  };

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
    const fav = new Set(favIds);
    return coaches.filter((c) => fav.has(c.id));
  }, [coaches, favIds]);

  const shown = useMemo(
    () =>
      items.filter(
        (i) =>
          (!focus || i.coachId === focus) &&
          (!cat || i.classType === cat) &&
          (!time || timeOfDay(i.mins) === time),
      ),
    [items, focus, cat, time],
  );

  // The rail of days: as far ahead as the feed itself looks, every day
  // drawn whether or not it holds anything, because a gap in the dates
  // reads as a broken calendar rather than a quiet Tuesday.
  const dayTabs = useMemo(() => {
    let last = todayIso;
    for (const i of items) if (i.iso > last) last = i.iso;
    const out: { iso: string; label: string }[] = [];
    for (let iso = todayIso, n = 0; iso <= last || n < 14; iso = plusDays(iso, 1), n++) {
      out.push({ iso, label: n === 0 ? "Today" : tabLabel(iso) });
      if (n > 30) break;
    }
    return out;
  }, [items, todayIso]);

  // The selected day's rows alone, in the flat grammar: the tab is the day
  // heading now, so the list carries no bands of its own. Every class lists
  // itself, by Matt's call: a busy place folded into one studio row for a
  // while, and on a young list that hides the very volume the screen is
  // trying to show. The fold can come back the day a single gym's Monday
  // actually drowns everything around it.
  const dayRows: WeekRow[] = useMemo(() => {
    const list = shown.filter((i) => i.iso === day).sort((a, b) => a.mins - b.mins);
    return list.map((i) => {
      const c = coachById.get(i.coachId);
      return {
        key: i.key,
        name: i.name,
        where: i.where,
        hm: i.hm,
        ap: i.ap,
        dur: `${i.durationMin} min`,
        coach: c ? { id: c.id, name: c.name, color: c.color, photo: c.photo } : null,
        onTap: () => setPeek(peekOf(i, c ?? null, favIds.includes(i.coachId))),
        menu: {
          classId: i.classId,
          base: i.base,
          iso: i.iso,
          canReport: i.coachId !== meId,
          onDetails: () => setPeek(peekOf(i, c ?? null, favIds.includes(i.coachId))),
          coach: c ? { name: c.name, href: `/${c.handle}` } : null,
          studio: i.where && i.whereHref ? { name: i.where, href: i.whereHref } : null,
        },
      };
    });
  }, [shown, day, coachById, favIds, meId]);

  // The feed is everyone now, so it is only ever empty when nothing is
  // listed near you at all: the one state a brand-new region sees. No
  // favorites is not an empty screen any more, because a favorite was never
  // what filled it.
  if (!items.length) {
    return (
      <>
        <div className="cardwrap">
          <div className="wkempty">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="wkempty-fig"
              src="/illustrations/following-empty.png"
              alt=""
              width={356}
              height={600}
            />
            <h2 className="wkempty-t">Nothing near you yet</h2>
            <p className="wkempty-b">
              Classes show up here as coaches list them. Find a coach to favorite in the
              meantime; their next class will lead your Discover.
            </p>
            <button className="btn si wkempty-cta" onClick={() => setFind(true)}>
              Find coaches
            </button>
          </div>
        </div>
        <button className="wkfab wkfab-find" aria-label="Find coaches" onClick={() => setFind(true)}>
          <Icon name="search" size={26} />
        </button>
        {find && <DiscoverSheet onClose={closeFind} />}
      </>
    );
  }

  return (
    <>
      {/* The rail is chrome, and it scrolls away with the page: the date
          tabs are what pin. */}
      <div className="tray" ref={trayRef}>
        {/* The rail is your favorites and only them, per the brief: a
            shortcut to the people you go to most, never what fills the list
            below. The caption under each face is when their next class is,
            so the rail answers "who can I train with next" unopened. */}
        <div className="tray-scroll">
          {rail.map((c) => {
            const on = focus === c.id;
            return (
              <button
                key={c.id}
                className={`trayitem${focus && !on ? " dim" : ""}`}
                aria-pressed={on}
                onClick={() => setPeekCoach(c)}
              >
                <span className={`trayav${on ? " sel" : ""}`}>
                  {c.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.photo} alt="" />
                  ) : (
                    <span className="trayav-ini" style={{ background: c.color }}>
                      {initials(c.name)}
                    </span>
                  )}
                </span>
                <span className="trayitem-nm">{c.name.split(/\s+/)[0]}</span>
              </button>
            );
          })}
          {/* The way to lengthen the rail, at the end of it, never one of
              the faces. With no favorites yet it gets two dashed
              placeholders for company and a line saying what the rail is
              for, per the brief: the shape of the thing sells the thing. */}
          <button className="trayitem" onClick={() => setFind(true)}>
            <span className="trayav trayav-add">
              <Icon name="add" size={28} />
            </span>
            <span className="trayitem-nm">Add</span>
          </button>
          {rail.length === 0 && (
            <>
              <span className="trayav trayav-ghost" aria-hidden="true" />
              <span className="trayav trayav-ghost" aria-hidden="true" />
            </>
          )}
        </div>
        {rail.length === 0 && (
          <p className="trayhint">
            Add the coaches you go to most. Their next class always shows here.
          </p>
        )}
      </div>

      {/* The filters: the category pills (the words the list actually
          holds), then the time of day. Two axes on one rail, kept apart by
          a hairline: what the class is, then when in the day it runs. Any
          category pick takes All off; All is the way back. No distance
          filter, deliberately: nothing here stores a coordinate, and a
          distance sorted from a guessed one would be a lie with units. */}
      <div className="nearhead">
        <span className="nearlbl">Upcoming classes</span>
        <div className="catpills">
          {cats.length > 0 && (
            <>
              <button
                className={`catpill${cat === null ? " on" : ""}`}
                aria-pressed={cat === null}
                onClick={() => setCat(null)}
              >
                All
              </button>
              {cats.map((t) => (
                <button
                  key={t}
                  className={`catpill${cat === t ? " on" : ""}`}
                  aria-pressed={cat === t}
                  onClick={() => setCat(cat === t ? null : t)}
                >
                  {t}
                </button>
              ))}
              <span className="catpill-div" aria-hidden="true" />
            </>
          )}
          {(
            [
              ["morning", "Morning"],
              ["afternoon", "Afternoon"],
              ["evening", "Evening"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              className={`catpill${time === id ? " on" : ""}`}
              aria-pressed={time === id}
              onClick={() => setTime(time === id ? null : id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* The dates, left to right, by Matt's call: one day at a time
          beats a three-week scroll. The row pins under the header while
          the list under it changes in place. */}
      <div className="daytabs" role="tablist" aria-label="Day">
        {dayTabs.map((t) => (
          <button
            key={t.iso}
            role="tab"
            aria-selected={day === t.iso}
            className={`daytab${day === t.iso ? " on" : ""}`}
            onClick={() => setDay(t.iso)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* The card starts under the faces: the rail is chrome, the week is
          content, and the card edge is what says so. */}
      <div className="cardwrap">
      {/* Who the rail has narrowed to, and the way to them.
          A filtered list looks exactly like a quiet week: five faces, one of
          them ringed, and a shorter list underneath. This says which coach in
          words, so the state is readable rather than inferred, and it carries
          the one thing you want next after "what has Emdilger got on", which
          is Emdilger. It is only drawn when a face is picked: with everyone
          showing there is nothing to name and no single profile to open. */}
      {focus &&
        (() => {
          const c = coachById.get(focus);
          if (!c) return null;
          return (
            <div className="focusbar">
              <span className="focusbar-t">Classes with {c.name.split(/\s+/)[0]}</span>
              <a className="focusbar-a" href={`/${c.handle}?from=following`}>
                View profile
                <Icon name="chevron_right" size={19} />
              </a>
            </div>
          );
        })()}

      {/* Why Today isn't the selected tab, said once: the landing skipped
          ahead to the first day holding anything, and a rail that opens on
          Wednesday with no word reads as a rail that lost its place. */}
      {landed.current !== todayIso && day === landed.current && (
        <p className="daynote">No classes today, showing {tabLabel(landed.current)}</p>
      )}

      {/* The day's list, flat, by Matt's call: time and length down the
          left, the class, the place and the coach stacked beside them, a
          hairline between rows and no containers. The boxes read as
          furniture on a screen whose whole job is scanning a day. */}
      {dayRows.length === 0 ? (
        <p className="dayempty">
          Nothing on {day === todayIso ? "today" : tabLabel(day)}
          {cat || time || focus ? " with these filters" : ""}.
        </p>
      ) : (
        <div className="disflat">
          {dayRows.map((r) =>
            r.menu ? (
              <div key={r.key} className="clrow">
                <ClassLine row={r} />
                <ClassRowMenu {...r.menu} name={r.name} />
              </div>
            ) : (
              <ClassLine key={r.key} row={r} />
            ),
          )}
        </div>
      )}
      </div>

      {/* Discovery is this button and the plus on the rail, and they open the
          same sheet. The dock carried a search circle for a build and Matt
          reverted it after living with it: the floating orange circle over
          the one list the act is about is the shape that stays. */}
      <button className="wkfab wkfab-find" aria-label="Find coaches" onClick={() => setFind(true)}>
        <Icon name="search" size={26} />
      </button>

      {find && <DiscoverSheet onClose={closeFind} />}

      {peekCoach && (
        <CoachPeek
          id={peekCoach.id}
          name={peekCoach.name}
          photo={peekCoach.photo}
          color={peekCoach.color}
          handle={peekCoach.handle}
          favorited={favIds.includes(peekCoach.id)}
          onClose={() => {
            setPeekCoach(null);
            // Saves and star flips happened server-side behind the sheet;
            // closing is where the list catches up.
            router.refresh();
          }}
        />
      )}

      {peek && (
        <ClassPeek
          cls={peek}
          onClose={() => setPeek(null)}
          onToast={toast}
          onChanged={() => {}}
        />
      )}
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}

/** Which stretch of the day a start time falls in: before noon, noon to
 *  five, five on. The evening starts at five because a 5:30 is an
 *  after-work class to everybody who takes one. */
function timeOfDay(mins: number): "morning" | "afternoon" | "evening" {
  return mins < 720 ? "morning" : mins < 1020 ? "afternoon" : "evening";
}

const plusDays = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/** "Mon 10": the weekday and the date, the way a booking rail says a day. */
function tabLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })} ${d.getUTCDate()}`;
}

/** The tapped occurrence, as the sheet wants it. Somebody else's class, so it
 *  names the coach and offers their week rather than an edit. */
function peekOf(i: FeedItem, coach: FeedCoach | null, favorited?: boolean): PeekClass {
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
    studioHref: i.whereHref,
    coach: coach
      ? { name: coach.name, handle: coach.handle, photo: coach.photo, color: coach.color, favorited }
      : null,
    // Where the depth is loaded from: a handle, or `s/{slug}` for a gym's
    // class, which is why the row carries it rather than the coach doing.
    base: i.base,
    mine: false,
    preview: {
      description: i.about,
      classType: i.classType,
      links: i.links,
      studioAddress: i.studioAddress,
    },
  };
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ScrollHead, useBandTop, useTopDayLabel } from "@/components/CalendarBits";
import { ClassPeek, type PeekClass } from "@/components/ClassPeek";
import { DiscoverSheet } from "@/components/DiscoverSheet";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";
import { fmtDayHeaderRel } from "@/lib/format";
import { DayList, WeekEmpty, initials, type WeekDayRows } from "@/components/WeekView";

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
  follows,
  todayIso,
  meId,
}: {
  items: FeedItem[];
  coaches: FeedCoach[];
  /** How many people they actually follow: the empty state's two wordings
   *  fork on this, because `coaches` carries a coach's own week too. */
  follows: number;
  todayIso: string;
  /** The viewer: their own rows (a coach's own week rides this feed) skip
   *  the report row, which could only ever answer with an error. */
  meId?: string;
}) {
  const [focus, setFocus] = useState<string | null>(null);
  const [peek, setPeek] = useState<PeekClass | null>(null);
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

  // The overlay header's words: the day under the top of the viewport. At
  // rest no day has reached it, the label is empty, and the bar stays away.
  const topDay = useTopDayLabel();

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
        return {
          iso,
          // "Today", "Tomorrow", then the date. The same words the rest of the
          // app uses for a day, so one day is never named two ways.
          label: fmtDayHeaderRel(iso, todayIso),
          today: iso === todayIso,
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
                dur: `${i.durationMin} min`,
                coach: c
                  ? { id: c.id, name: c.name, color: c.color, photo: c.photo }
                  : null,
                onTap: () => setPeek(peekOf(i, c ?? null)),
                menu: {
                  classId: i.classId,
                  base: i.base,
                  iso: i.iso,
                  canReport: i.coachId !== meId,
                },
              };
            }),
        };
      });
  }, [shown, coachById, todayIso]);

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
            <h2 className="wkempty-t">
              {follows ? "Nothing up yet" : "Start by following a coach"}
            </h2>
            <p className="wkempty-b">
              {follows
                ? "The people you follow have not put any classes up. This fills in as they do."
                : "Once you follow someone, every class they post will show up here."}
            </p>
            {/* One CTA, and it is this screen's own act: finding somebody.
                Nothing here about adding classes, which is the calendar's
                sentence, not Following's. */}
            <button className="btn si wkempty-cta" onClick={() => setFind(true)}>
              Find a coach
            </button>
          </div>
        </div>
        {find && <DiscoverSheet onClose={closeFind} />}
      </>
    );
  }

  return (
    <>
      {/* The overlay header: nothing at rest, and the day under it once
          you're deep, so the scroll is never unlabelled. */}
      <ScrollHead on={!!topDay} label={topDay} />
      {/* The rail is chrome, and it scrolls away with the page now: the
          overlay header is what stays. */}
      <div className="tray" ref={trayRef}>
        <div className="tray-scroll">
          <button
            className="trayitem"
            onClick={() => setFocus(null)}
            aria-pressed={focus === null}
          >
            {/* The Following tab's own glyph, not the word: the circle means
                "everyone on this rail", which is what the tab means too. */}
            <span className={`trayav trayav-all${focus === null ? " sel" : ""}`}>
              <Icon name="groups" size={34} />
            </span>
            <span className="trayitem-nm">All coaches</span>
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
                      {initials(c.name)}
                    </span>
                  )}
                </span>
                <span className="trayitem-nm">{c.name.split(/\s+/)[0]}</span>
              </button>
            );
          })}
          {/* The way to lengthen the rail, at the end of it, never one of the
              faces: it keeps its full opacity when a face is picked. */}
          <button className="trayitem" onClick={() => setFind(true)}>
            <span className="trayav trayav-add">
              <Icon name="add" size={28} />
            </span>
            <span className="trayitem-nm">Find</span>
          </button>
        </div>
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

      {/* No week stepper here, on purpose. Your calendar is a week you flip
          through, because you are working on it; this is a list of what is
          coming, because you are reading it and "when can I train next" is not
          a question any week boundary answers.

          No heading either. "Coming up" was a 32px title saying what the date
          headings underneath it already say, and the line under it counted
          the classes and the coaches, which is arithmetic the list is doing
          at you: the rows are the answer and they are right there. Both came
          off, so the faces are followed by the first day rather than by two
          lines about the faces. */}
      {days.length === 0 ? (
        <WeekEmpty
          first
          title={focus ? "Nothing from them coming up" : "Nothing coming up"}
          body={
            focus
              ? "Tap All coaches to see the rest."
              : "The people you follow have not put anything up yet."
          }
        />
      ) : (
        <DayList days={days} />
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
    studioHref: i.whereHref,
    coach: coach
      ? { name: coach.name, handle: coach.handle, photo: coach.photo, color: coach.color }
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

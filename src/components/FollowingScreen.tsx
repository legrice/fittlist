"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setGoing } from "@/app/actions/going";
import { ClassPeek, type PeekClass } from "@/components/ClassPeek";
import { CoachPeek } from "@/components/CoachPeek";
import { DiscoverSheet } from "@/components/DiscoverSheet";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";
import { initials } from "@/components/WeekView";
import { initialOf } from "@/lib/avatar";

export type FeedCoach = {
  id: string;
  name: string;
  handle: string;
  photo: string | null;
  color: string;
  /** When their next class is ("Today 6:00p"): the Add screen's browse list
   *  and People near you still say it. The rail deliberately does not. */
  next: string | null;
};

/** One circle on the This week rail: somebody you follow with something
 *  actually coming up, a class they coach or one they are going to. The
 *  circle is a name and a ring, nothing else. */
export type RailPerson = {
  id: string;
  name: string;
  handle: string | null;
  photo: string | null;
  color: string;
  /** Their week changed since you last opened it: the ring is orange. */
  fresh: boolean;
  /** When their next thing is, for the soonest-first order. */
  nextAt: string;
};

/** A tile on the Studios near you rail: a rectangle, because a place is a
 *  room and a person is a face. Closest first, as honestly as we can say
 *  it: the viewer's own city leads on the server, and the rail re-sorts by
 *  real distance once the distance filter has already earned the pin. */
export type NearStudio = {
  id: string;
  slug: string;
  name: string;
  photo: string | null;
  color: string;
  lat: number | null;
  lng: number | null;
  local: boolean;
};

/** A circle on the Coaches near you rail, the viewer's own follow state
 *  riding along so the pill under the face starts right. */
export type LocalCoach = {
  id: string;
  handle: string;
  name: string;
  photo: string | null;
  color: string;
  following: boolean;
  requested: boolean;
  local: boolean;
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
  /** The studio's coordinates, for the distance filter. Null passes any
   *  distance: a class with no pin should widen a search, not vanish. */
  lat: number | null;
  lng: number | null;
  /** The viewer already saved this occurrence: the corner ribbon starts
   *  filled. */
  saved: boolean;
};

/** The brief says hide the rail below about three people; the floor here is
 *  one, because three hides the rail for nearly every account at current
 *  density and takes the peek with it. Raise it when density does. */
const RAIL_MIN_PEOPLE = 1;

/** How many cards the Upcoming rail draws: a taste, not the list. The
 *  arrow in the head opens the whole thing on Search's Classes segment. */
const UPCOMING_RAIL = 12;

/**
 * Home: the This week rail, then three rails of what's around you.
 *
 * The faces are the people you follow who actually have something coming
 * up, soonest first, each circle a name and a ring: solid orange when
 * their week changed since you last opened it, bare once seen. Under them
 * Upcoming near you is a rail of event cards (every listable coach's
 * classes, whether or not you follow anybody), then the studios and the
 * coaches around you. Each head's arrow opens Search on that kind's
 * segment; the full browsable list lives there now.
 */
export function FollowingScreen({
  items,
  coaches,
  favIds,
  cats,
  follows,
  todayIso,
  meId,
  myRail,
  meKind,
  meFace,
  nearStudios,
  localCoaches,
}: {
  items: FeedItem[];
  coaches: FeedCoach[];
  /** Who the viewer follows, for the class peek's Follow pill state. */
  favIds: string[];
  /** The type filter's options, from what the list actually holds. */
  cats: string[];
  /** How many people they follow: the rail's teaching state forks on this. */
  follows: number;
  todayIso: string;
  /** The viewer: their own rows carry no Save, because setGoing refuses a
   *  mark on your own class and a button that fails is worse than none. */
  meId?: string;
  myRail: RailPerson[];
  /** Where the You circle points: the hub is per kind. */
  meKind: "coach" | "member";
  /** The viewer's own face, leading the rail: your circle is you, not a
   *  glyph, by Matt's call. */
  meFace: { photo: string | null; name: string; color: string };
  /** The rails under the schedule, by Matt's call: the places and the
   *  people around you, with Follow one tap deep. */
  nearStudios: NearStudio[];
  localCoaches: LocalCoach[];
}) {
  const [peek, setPeek] = useState<PeekClass | null>(null);
  const [peekPerson, setPeekPerson] = useState<RailPerson | null>(null);
  const [find, setFind] = useState(false);
  const [toastMsg, toastOn, toast] = useToast();
  // The save toast carries "See it": the calendar the class landed on is a
  // tab away, and the link points at the exact occurrence (?hl lights it).
  const [toastGo, setToastGo] = useState<string | null>(null);
  const calHref = meKind === "coach" ? "/calendar" : "/week";
  const notify = (msg: string, hlKey?: string) => {
    setToastGo(hlKey ? `${calHref}?hl=${encodeURIComponent(hlKey)}` : null);
    toast(msg);
  };
  const router = useRouter();

  const closeFind = () => {
    setFind(false);
    router.refresh();
  };

  const coachById = useMemo(() => new Map(coaches.map((c) => [c.id, c])), [coaches]);

  // The rail's cards: the next things near you, in time order, capped
  // because a rail is a taste and the arrow is the whole list.
  const upcoming = useMemo(() => {
    const kept = [...items].sort((a, b) =>
      a.iso === b.iso ? a.mins - b.mins : a.iso < b.iso ? -1 : 1,
    );
    return kept.slice(0, UPCOMING_RAIL);
  }, [items]);

  // Hide the rail rather than draw it dead: following nobody keeps the
  // teaching state (ghosts and one line), following only people with
  // nothing coming up hides the block entirely.
  const railShows = follows === 0 || myRail.length >= RAIL_MIN_PEOPLE;

  return (
    <>
      {/* No search bar up here any more, by Matt's call: the magnifier
          lives in the header's corner, right of the bell, and the rail
          leads the screen. */}
      {/* This week: the people you follow with something coming up, soonest
          first, no captions and no badges. A circle is a name and a ring,
          the ring is the freshness signal, and tapping one opens their
          week. You lead it, wearing your own face, and Add ends it. */}
      {railShows && (
        <div className="tray">
          <p className="nearlbl railbl">This week</p>
          <div className="tray-scroll">
            <Link className="trayitem" href={meKind === "coach" ? "/coachshare" : "/membershare"}>
              <span className="trayav trayav-you">
                {meFace.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={meFace.photo} alt="" />
                ) : (
                  <span className="trayav-ini" style={{ background: meFace.color }}>
                    {initials(meFace.name)}
                  </span>
                )}
              </span>
              <span className="trayitem-nm">You</span>
            </Link>
            {myRail.map((p) => (
              <button key={p.id} className="trayitem" onClick={() => setPeekPerson(p)}>
                <span className={`trayav trayav-ring${p.fresh ? "" : " seen"}`}>
                  {p.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.photo} alt="" />
                  ) : (
                    <span className="trayav-ini" style={{ background: p.color }}>
                      {initials(p.name)}
                    </span>
                  )}
                </span>
                <span className="trayitem-nm">{p.name.split(/\s+/)[0]}</span>
              </button>
            ))}
            <button className="trayitem" onClick={() => setFind(true)}>
              <span className="trayav trayav-add">
                <Icon name="add" size={28} />
              </span>
              <span className="trayitem-nm">Add</span>
            </button>
            {follows === 0 && (
              <>
                <span className="trayav trayav-ghost" aria-hidden="true" />
                <span className="trayav trayav-ghost" aria-hidden="true" />
              </>
            )}
          </div>
          {follows === 0 && (
            <p className="trayhint">
              Follow the coaches you go to most and the friends you train with. Their week
              shows up here.
            </p>
          )}
        </div>
      )}

      {/* Upcoming near you is a rail of event cards now, by Matt's call:
          the date as a leaf on the left, the class beside it, the arrow in
          the head the door to the full browsable list (Search's Classes
          segment). The filters and the date tabs went with the vertical
          list; both live in git at the commit that replaced them. */}
      {items.length === 0 ? (
        <>
          <div className="nearhead nearhead-row">
            <span className="nearlbl">Upcoming near you</span>
          </div>
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
              Classes show up here as coaches list them. Find people to follow in the
              meantime; their week shows up at the top.
            </p>
            <button className="btn si wkempty-cta" onClick={() => setFind(true)}>
              Find people
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="nearhead nearhead-row">
            <span className="nearlbl">Upcoming near you</span>
            <Link className="nearhead-go" href="/search?seg=classes" aria-label="All upcoming classes">
              <Icon name="arrow_forward" size={22} />
            </Link>
          </div>
          <div className="uprail">
            {upcoming.map((i) => {
              const c = coachById.get(i.coachId);
              const d = new Date(`${i.iso}T00:00:00Z`);
              const dow =
                i.iso === todayIso
                  ? "Today"
                  : d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
              return (
                <div key={i.key} className="uprail-card">
                  <button
                    className="uprail-go"
                    onClick={() => setPeek(peekOf(i, c ?? null, favIds.includes(i.coachId)))}
                  >
                    <span className={`uprail-date${i.iso === todayIso ? " today" : ""}`}>
                      <span className="uprail-dow">{dow}</span>
                      <span className="uprail-dom">{d.getUTCDate()}</span>
                    </span>
                    <span className="uprail-txt">
                      <span className="uprail-nm">{i.name}</span>
                      <span className="uprail-sub">
                        {i.hm}
                        {i.ap.toLowerCase()}
                        {i.where ? ` · ${i.where}` : ""}
                      </span>
                      {c && <span className="uprail-who">{c.name.split(/\s+/)[0]}</span>}
                    </span>
                  </button>
                  {i.coachId !== meId && (
                    <SaveCorner
                      classId={i.classId}
                      iso={i.iso}
                      name={i.name}
                      initial={i.saved}
                      onToast={notify}
                      bare
                    />
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Under the schedule, the places and the people, by Matt's call:
          the studios closest to you as rectangles on a rail, then the
          coaches around you with Follow one tap deep. Your own city leads
          both. Each head's arrow opens Search on that kind's segment. */}
      {nearStudios.length > 0 && (
        <section className="nearrail">
          <div className="nearhead nearhead-row">
            <span className="nearlbl">Studios near you</span>
            <Link className="nearhead-go" href="/search?seg=studios" aria-label="All studios">
              <Icon name="arrow_forward" size={22} />
            </Link>
          </div>
          <div className="strail">
            {nearStudios.map((s) => (
              <Link key={s.id} className="strail-item" href={`/s/${s.slug}?from=discover`}>
                <span className="strail-ph">
                  {s.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.photo} alt="" />
                  ) : (
                    <span className="strail-ini" style={{ background: s.color }}>
                      {initialOf(s.name)}
                    </span>
                  )}
                </span>
                <span className="strail-nm">{s.name}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
      {localCoaches.length > 0 && (
        <section className="nearrail">
          <div className="nearhead nearhead-row">
            <span className="nearlbl">Coaches near you</span>
            <Link className="nearhead-go" href="/search?seg=people" aria-label="All coaches and members">
              <Icon name="arrow_forward" size={22} />
            </Link>
          </div>
          <div className="ctrail">
            {localCoaches.map((c) => (
              <CoachNear key={c.id} c={c} />
            ))}
          </div>
        </section>
      )}

      {/* No floating search circle either: the Search tab took the act.
          People near you stays one tap away behind the rail's Add. */}
      {find && <DiscoverSheet onClose={closeFind} />}

      {peekPerson && (
        <CoachPeek
          id={peekPerson.id}
          name={peekPerson.name}
          photo={peekPerson.photo}
          color={peekPerson.color}
          onClose={() => {
            setPeekPerson(null);
            // The ring went out and follows may have flipped behind the
            // sheet; closing is where the rail catches up.
            router.refresh();
          }}
        />
      )}

      {peek && (
        <ClassPeek cls={peek} onClose={() => setPeek(null)} onToast={notify} onChanged={() => {}} />
      )}
      <Toast
        msg={toastMsg}
        on={toastOn}
        action={toastGo ? { label: "See it", href: toastGo } : null}
      />
    </>
  );
}

/** The corner ribbon: the one act this list turns on. Optimistic, so the
 *  ribbon fills on the tap rather than the round trip; the toast says
 *  where the class went, because the calendar is another tab away. */
function SaveCorner({
  classId,
  iso,
  name,
  initial,
  onToast,
  bare = false,
}: {
  classId: string;
  iso: string;
  name: string;
  initial: boolean;
  onToast: (msg: string, hlKey?: string) => void;
  /** The glyph alone, for the rail's compact card: the aria-label still
   *  says the word. */
  bare?: boolean;
}) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);
  return (
    <button
      className={`rowsave${on ? " on" : ""}${bare ? " bare" : ""}`}
      aria-pressed={on}
      aria-label={on ? `Saved: ${name}` : `Save ${name}`}
      disabled={busy}
      onClick={async () => {
        if (busy) return;
        setBusy(true);
        setOn(!on);
        const res = await setGoing(classId, iso, !on);
        if (!res.ok) setOn(on);
        else if (!on) onToast("Saved to your calendar", `${classId}.${iso}`);
        setBusy(false);
      }}
    >
      <Icon name={on ? "bookmark_added" : "bookmark"} size={20} />
      {!bare && <span>{on ? "Saved" : "Save"}</span>}
    </button>
  );
}

/** One circle on the Coaches near you rail: the face opens their page, and
 *  the pill under it follows without leaving the list. The pill only draws
 *  while there is something to do: followed means no pill, and Requested is
 *  the cancel, the way it is everywhere else. */
function CoachNear({ c }: { c: LocalCoach }) {
  const [state, setState] = useState<"off" | "following" | "requested">(
    c.following ? "following" : c.requested ? "requested" : "off",
  );
  const [busy, setBusy] = useState(false);
  const tap = async () => {
    if (busy || state === "following") return;
    setBusy(true);
    if (state === "off") {
      const { followTrainer } = await import("@/app/actions/subscribe");
      const res = await followTrainer(c.handle);
      if (res.ok) setState(res.requested ? "requested" : "following");
    } else {
      const { unfollowTrainer } = await import("@/app/actions/subscribe");
      const res = await unfollowTrainer(c.handle);
      if (res.ok) setState("off");
    }
    setBusy(false);
  };
  return (
    <div className="ctrail-item">
      <Link className="ctrail-go" href={`/${c.handle}?from=discover`}>
        <span className="trayav ctrail-av">
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
      </Link>
      {state !== "following" && (
        <button
          className={`peekfollow ctrail-fl${state === "requested" ? " on" : ""}`}
          disabled={busy}
          onClick={tap}
        >
          {state === "requested" ? "Requested" : "Follow"}
        </button>
      )}
    </div>
  );
}

/** The tapped occurrence, as the sheet wants it. Somebody else's class, so it
 *  names the coach and offers their week rather than an edit. */
function peekOf(i: FeedItem, coach: FeedCoach | null, following?: boolean): PeekClass {
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
      ? { name: coach.name, handle: coach.handle, photo: coach.photo, color: coach.color, favorited: following }
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

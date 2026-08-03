"use client";

import type { ReactNode } from "react";
import { dayBandLabel } from "@/lib/format";

// One class row, everywhere a day-by-day list of them appears.
//
// Following and Your plans are the same list of the same thing seen two ways,
// and they had drifted into two sets of markup: one with the coach's face over
// the class name and the time down the right, the other with the time folded
// into a grey sub-line and no face at all. A member flipping between the tabs
// was reading two designs for one idea. This is the row both of them render.
//
// It is deliberately not a calendar row: no grid position, no empty slots. The
// day heading and the order are all the structure there is.

export type AgendaItem = {
  /** Unique within the day. The caller's own id; this only keys the list. */
  key: string;
  name: string;
  hm: string;
  ap: string;
  durationMin: number;
  where?: string | null;
  coachName?: string | null;
  coachPhoto?: string | null;
  coachColor: string;
  /** The viewer teaches this one. */
  you?: boolean;
  /** A word in the time column: Added, Shift, Mine. */
  tag?: string | null;
  /** The viewer's relationship to the row, worn as the card's colour on
   *  their own calendar. Following passes none and keeps the paper. */
  kind?: "coaching" | "added" | "private" | null;
  /** Marked as going: the accent thickens. */
  on?: boolean;
  /** The real page behind it, when there is one. A row with a link is still a
   *  link, so a middle click and a crawler both get what they expect. */
  href?: string | null;
  /** A fact with nothing behind it: a studio's community row, distilled from
   *  members' entries. Not a link and not a button, because there is no page
   *  and nothing to press. */
  plain?: boolean;
  /** For ClassOpener, which reads these off the row rather than the list. */
  classId?: string;
  iso?: string;
  base?: string;
};

export type AgendaDay = {
  iso: string;
  /** No longer what the band renders: `DayBand` derives its own two halves
   *  from `iso` so every list words a day the same way. Callers still build
   *  this and nothing reads it, which is a cleanup of its own rather than a
   *  thing to do halfway inside a visual change. Editing it changes nothing
   *  on screen; change `dayBandParts` instead. */
  label: string;
  items: AgendaItem[];
};

export function AgendaAvatar({
  photo,
  name,
  color,
  cls = "ps-ecoachav",
}: {
  photo: string | null | undefined;
  name: string;
  color: string;
  cls?: string;
}) {
  return photo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={cls} src={photo} alt="" />
  ) : (
    <span className={`${cls} ${cls}-empty`} style={{ background: color }} aria-hidden="true">
      {(name.trim().charAt(0) || "?").toUpperCase()}
    </span>
  );
}

/**
 * The day heading, on every list of classes there is.
 *
 * It used to be the same visual species as the class names under it: large,
 * bold, dark, left-aligned, the same weight. A heading that competes on the
 * axis its own contents own doesn't read as a level above them, it reads as
 * another entry, and making it bigger only sharpens the fight. So it goes the
 * other way: small, wide-tracked and uppercase against large, tight and
 * mixed-case, on a band of its own.
 *
 * The band is the paper colour rather than a darker cream: a strip that sinks
 * into the page reads as mud, and this one has to lift off it. Today's name
 * is the one spot of brand in the list.
 */
export function DayBand({
  iso,
  today,
  count,
}: {
  iso: string;
  today?: string;
  /** How many classes the day holds, across from its name. */
  count?: number;
}) {
  return (
    <div className={`ps-daycol${today && iso === today ? " ps-daycol-today" : ""}`}>
      <span className="ps-dayname">{dayBandLabel(iso, today)}</span>
      {count != null && (
        <span className="ps-daycount">
          {count} {count === 1 ? "class" : "classes"}
        </span>
      )}
    </div>
  );
}

/** The row itself: a link when something is behind it, a button otherwise. */
export function ClassRow({
  item,
  onClick,
  children,
}: {
  item: AgendaItem;
  onClick?: () => void;
  /** Anything the row says under the class name, like who else is going. */
  children?: ReactNode;
}) {
  const inner = (
    <>
      {/* The coach's colour on merged lists; on your own calendar the kind
          colours the bar through CSS, and an inline value would override it. */}
      <span
        className="ps-accent"
        style={item.kind ? undefined : { background: item.coachColor }}
        aria-hidden="true"
      />
      {/* Who first, then what, then where: on a list drawn from more than one
          coach, the coach is how you place the class. A personal entry has
          no coach to show, so its line above the name says whose it is. */}
      <span className="ps-ebody">
        {item.kind === "private" && (
          <span className="ps-private ps-shifttop ps-tag-added">Added by you</span>
        )}
        {item.coachName?.trim() && (
          <span className="ps-ecoach">
            <AgendaAvatar photo={item.coachPhoto} name={item.coachName} color={item.coachColor} />
            <span className="ps-ecoach-txt">{item.coachName}</span>
            {item.you && <span className="ps-youtag">You</span>}
          </span>
        )}
        <span className="ps-enm">{item.name}</span>
        {item.where && <span className="ps-estudio ps-ewhere">{item.where}</span>}
        {children}
      </span>
      {/* The corner, not the time row: leading the clock shoved the time
          sideways on tagged cards, so tagged and untagged rows stopped lining
          up. Bottom right is the Add button's spot, and a personal card has
          no Add button, so the two never meet. */}
      {item.tag && <span className="ps-goingtag">{item.tag}</span>}
      <span className="ps-etimecol">
        <span className="ps-etime">
          {item.hm}
          <span className="ps-ap">{item.ap}</span>
        </span>
        <span className="ps-edur">{item.durationMin} min</span>
      </span>
    </>
  );
  const cls = `ps-event${item.kind ? ` ev-${item.kind}` : ""}${item.on ? " goingon" : ""}`;
  if (item.plain) return <div className={`${cls} ps-event-plain`}>{inner}</div>;
  // A plain anchor rather than next/link: these lists sit inside ClassOpener,
  // which catches the tap, and the href is there for the modified click and the
  // crawler. Prefetching a page nobody navigates to is work for nothing.
  return item.href ? (
    <a
      className={cls}
      href={item.href}
      data-cid={item.classId}
      data-d={item.iso}
      data-base={item.base}
      onClick={onClick}
    >
      {inner}
    </a>
  ) : (
    <button className={cls} onClick={onClick}>
      {inner}
    </button>
  );
}

/** Day headings with their rows under them. The caller wraps each row, because
 *  what sits around one differs: a swipe on Following, a remove on Your plans. */
export function Agenda({
  days,
  className = "",
  dimBefore,
  today,
  row,
}: {
  days: AgendaDay[];
  className?: string;
  /** Days before this iso render dimmed: the scrolled-back past is a record,
   *  not the plan, and it says so the way the month grid does. */
  dimBefore?: string;
  /** The app's today, so the two nearest bands can say Today and Tomorrow.
   *  A caller without one gets weekdays all the way down, which is right
   *  rather than wrong: a list nobody is standing in has no "today". */
  today?: string;
  row: (item: AgendaItem, day: AgendaDay) => ReactNode;
}) {
  return (
    <div className={`ps-week ps-agenda${className ? ` ${className}` : ""}`}>
      {days.map((d) => (
        // The id is the month grid's landing spot: a tapped day scrolls the
        // list here.
        <div
          key={d.iso}
          id={`day-${d.iso}`}
          className={`ps-daygroup${dimBefore && d.iso < dimBefore ? " ps-pastday" : ""}`}
        >
          <DayBand iso={d.iso} today={today} count={d.items.length} />
          <div className="ps-daycards">
            {d.items.map((i) => (
              <div key={i.key} className="ps-erow">
                {row(i, d)}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

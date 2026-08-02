"use client";

import type { ReactNode } from "react";
import { classColor } from "@/lib/avatar";

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
  /** The class photo, filling the card; without one the card wears the type's
   *  colour, so Yoga is the same colour on every card it appears on. */
  image?: string | null;
  classType?: string | null;
  coachName?: string | null;
  coachPhoto?: string | null;
  coachColor: string;
  /** The viewer teaches this one. */
  you?: boolean;
  /** A word in the time column: Added, Shift, Mine. */
  tag?: string | null;
  /** Marked as going: the accent thickens. */
  on?: boolean;
  /** The real page behind it, when there is one. A row with a link is still a
   *  link, so a middle click and a crawler both get what they expect. */
  href?: string | null;
  /** For ClassOpener, which reads these off the row rather than the list. */
  classId?: string;
  iso?: string;
  base?: string;
};

export type AgendaDay = { iso: string; label: string; items: AgendaItem[] };

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

/** A hex colour pulled toward black, as rgba. The card's fade is tinted with
 *  the class's own colour rather than plain black, which is what makes each
 *  one read as cut from its poster instead of stamped from a template. */
function shade(hex: string, keep: number, alpha: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = Math.round(((n >> 16) & 255) * keep);
  const g = Math.round(((n >> 8) & 255) * keep);
  const b = Math.round((n & 255) * keep);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** The same colour pulled toward white instead, for the glow's bright edge. */
function tint(hex: string, amt: number, alpha: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = Math.round(((n >> 16) & 255) + (255 - ((n >> 16) & 255)) * amt);
  const g = Math.round(((n >> 8) & 255) + (255 - ((n >> 8) & 255)) * amt);
  const b = Math.round((n & 255) + (255 - (n & 255)) * amt);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * The background a class wears when it has no photo.
 *
 * A flat slab of the type's colour made the list a wall of paint chips, each
 * card shouting over the one before it. This is the same colour worn quietly:
 * a near-ink base so every card sits at the same darkness, with two soft
 * glows in the class's own hue. The seed moves the glows around, so two
 * photo-less cards in a row don't read as the same template twice; the hue
 * still does the identifying, which is the whole point of the type colour.
 */
function quietBackground(accent: string, seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  h = Math.abs(h);
  const x1 = 62 + (h % 30); // top glow drifts across the right half
  const y2 = 78 + ((h >> 5) % 30); // bottom glow sits low, left
  const x2 = 2 + ((h >> 10) % 22);
  return [
    `radial-gradient(120% 110% at ${x1}% -12%, ${tint(accent, 0.18, 0.55)} 0%, rgba(0, 0, 0, 0) 58%)`,
    `radial-gradient(95% 95% at ${x2}% ${y2}%, ${shade(accent, 0.85, 0.5)} 0%, rgba(0, 0, 0, 0) 62%)`,
    shade(accent, 0.22, 1),
  ].join(", ");
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
  const accent = classColor(item.classType, item.coachColor);
  const inner = (
    <>
      <span className="ps-accent" style={{ background: item.coachColor }} aria-hidden="true" />
      {/* The photo fills the card; without one the type's colour does. The
          fade at the bottom is that same colour pulled toward black, so the
          words always sit on something dark enough to read against. */}
      <span
        className="evcard-media"
        style={item.image ? undefined : { background: quietBackground(accent, item.name) }}
        aria-hidden="true"
      >
        {item.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="evcard-img" src={item.image} alt="" />
        )}
      </span>
      <span
        className="evcard-scrim"
        style={{
          background: `linear-gradient(to top, ${shade(accent, 0.34, 0.94)} 0%, ${shade(accent, 0.34, 0.55)} 34%, rgba(0, 0, 0, 0) 66%)`,
        }}
        aria-hidden="true"
      />
      {/* Who first, then what, then where: on a list drawn from more than one
          coach, the coach is how you place the class. */}
      <span className="ps-ebody">
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
      <span className="ps-etimecol">
        {item.tag && <span className="ps-goingtag">{item.tag}</span>}
        <span className="ps-etime">
          {item.hm}
          <span className="ps-ap">{item.ap}</span>
        </span>
        <span className="ps-edur">{item.durationMin} min</span>
      </span>
    </>
  );
  const cls = `ps-event${item.on ? " goingon" : ""}`;
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
  row,
}: {
  days: AgendaDay[];
  className?: string;
  row: (item: AgendaItem, day: AgendaDay) => ReactNode;
}) {
  return (
    <div className={`ps-week ps-agenda${className ? ` ${className}` : ""}`}>
      {days.map((d) => (
        <div key={d.iso} className="ps-daygroup">
          <div className="ps-daycol">{d.label}</div>
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

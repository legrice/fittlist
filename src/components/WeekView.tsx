"use client";

import { WEEKS_AHEAD, weekRangeLabel } from "@/lib/format";
import { Icon } from "@/components/Icon";

/**
 * The week stepper, and the day rows under it.
 *
 * This is the shape both Calendar and Following take, which is the point: the
 * app used to draw a schedule four different ways and a person moving between
 * two tabs was reading two apps. One week at a time, an arrow either side,
 * three weeks in the range. A calendar you flip through is a thing you read; a
 * schedule that runs a year out is a thing you scroll, and scrolling was how
 * the old one hid its own emptiness.
 *
 * Nothing here knows whose week it is. Calendar passes the classes somebody
 * teaches, Following passes the merged week of everyone they follow, and the
 * only difference on screen is that a Following row leads with a coach.
 */

export type WeekRow = {
  /** Stable per occurrence: a weekly class is a different row each week. */
  key: string;
  name: string;
  /** The studio, or the class's own location when it names one. */
  where: string | null;
  /** "6:00" and "pm", kept apart so the meridiem can ride small. */
  hm: string;
  ap: string;
  /** Following only: whose class this is. */
  coach?: { id: string; name: string; color: string; photo: string | null } | null;
  /** Where tapping goes. Absent rows are inert, which is what a member's
   *  read-only week wants for anything it cannot open. */
  href?: string;
  /** Handed to a wrapping ClassOpener so a tap is a sheet, not a page. */
  classId?: string;
  iso?: string;
  base?: string;
};

export type WeekDayRows = { iso: string; dow: string; date: string; rows: WeekRow[] };

/** The sticky header: the range, and the two arrows. Greyed at the ends of
 *  the range rather than hidden, so the control never moves under a thumb. */
export function WeekStepper({
  week,
  onWeek,
  children,
}: {
  week: number;
  onWeek: (w: number) => void;
  /** The summary line Following carries under the range. */
  children?: React.ReactNode;
}) {
  return (
    <div className="wkhead">
      <div className="wkhead-row">
        <h1 className="wkhead-range">{weekRangeLabel(week)}</h1>
        <div className="wkhead-arrows">
          <button
            className="wkarrow"
            aria-label="Previous week"
            disabled={week === 0}
            onClick={() => onWeek(Math.max(0, week - 1))}
          >
            <Icon name="chevron_left" size={20} />
          </button>
          <button
            className="wkarrow"
            aria-label="Next week"
            disabled={week === WEEKS_AHEAD}
            onClick={() => onWeek(Math.min(WEEKS_AHEAD, week + 1))}
          >
            <Icon name="chevron_right" size={20} />
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}

/** One day: the date in a left gutter, its classes in the column beside it.
 *  Only days that hold something are drawn, so an empty Tuesday costs nothing
 *  and a light week reads as a light week rather than a wall of blanks. */
export function WeekDays({ days }: { days: WeekDayRows[] }) {
  return (
    <div className="wkdays">
      {days.map((d) => (
        <div key={d.iso} className="wkday">
          <div className="wkday-when">
            <span className="wkday-dow">{d.dow}</span>
            <span className="wkday-date">{d.date}</span>
          </div>
          <div className="wkday-rows">
            {d.rows.map((r) => (
              <WeekClassRow key={r.key} row={r} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function WeekClassRow({ row }: { row: WeekRow }) {
  const inner = (
    <>
      {row.coach && (
        <span className="wkrow-coach">
          <span className="wkrow-dot" style={{ background: row.coach.color }}>
            {row.coach.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={row.coach.photo} alt="" />
            ) : null}
          </span>
          {row.coach.name}
        </span>
      )}
      <span className="wkrow-body">
        <span className="wkrow-txt">
          <span className="wkrow-nm">{row.name}</span>
          {row.where && <span className="wkrow-where">{row.where}</span>}
        </span>
        <span className="wkrow-time">
          {row.hm}
          <span className="wkrow-ap">{row.ap.toLowerCase()}</span>
        </span>
      </span>
    </>
  );
  // A real href when there is a page behind it, so a modified click still
  // opens it and a crawler still sees a link; the wrapping ClassOpener catches
  // the ordinary tap and shows the sheet instead.
  if (!row.href) return <div className="wkrow">{inner}</div>;
  return (
    <a
      className="wkrow"
      href={row.href}
      data-cid={row.classId}
      data-d={row.iso}
      data-base={row.base}
    >
      {inner}
    </a>
  );
}

/** The dashed block a week with nothing in it draws. It is a screen in its own
 *  right rather than an apology: on the first week it offers the thing to do,
 *  and on a later one it only says there is nothing there, because "add your
 *  first class" is wrong advice on a week you flipped forward to. */
export function WeekEmpty({
  first,
  title,
  body,
  cta,
  onCta,
}: {
  first: boolean;
  title: string;
  body: string;
  cta?: string;
  onCta?: () => void;
}) {
  return (
    <div className="wkempty">
      <h2 className="wkempty-t">{first ? title : "Nothing this week"}</h2>
      <p className="wkempty-b">{first ? body : "Try the arrow, or add something to it."}</p>
      {first && cta && onCta && (
        <button className="btn si wkempty-cta" onClick={onCta}>
          {cta}
        </button>
      )}
    </div>
  );
}

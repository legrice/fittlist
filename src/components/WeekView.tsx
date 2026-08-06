"use client";

/**
 * One list of classes, for every screen that draws one.
 *
 * The calendar, Following and a coach's public page all show the same thing:
 * days, and what is on them. They had three shapes between them at various
 * points (a week you stepped through with a date gutter, a flat list under
 * headings, a card list) and somebody moving between two of them was reading
 * two apps. This is the one shape, and the only thing that differs is whether
 * a row names its coach.
 *
 * The layout is built for reading down a long scroll:
 *
 *   * A full-bleed band per day, in the cream, with the date at the gutter and
 *     the count across from it. It pins under the chrome, so the day you are
 *     looking at is always named.
 *   * A time gutter down the left, so the times line up as a column and the
 *     eye can run down them without reading a single class name.
 *   * The class name is the loudest thing on the screen, because this is a
 *     calendar app and a calendar is a list of class names; everything else on
 *     the row is a caption on one.
 *
 * The week stepper that used to sit on top of the calendar went with the old
 * shape. Three weeks with an arrow either side was a control asking somebody
 * to page through a thing they can scroll, and it capped the calendar at three
 * weeks for no reason the data had.
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
  /** What tapping does. Every row opens a sheet over the list rather than
   *  navigating: the list you came from is the thing you want back. */
  onTap?: () => void;
};

export type WeekDayRows = {
  iso: string;
  /** The band's words: "Today, Aug 6", "Thu, Aug 6". Decided by the caller,
   *  because only it knows what today is on the app's clock. */
  label: string;
  /** Today wears a dot, and nothing else on the list does. */
  today?: boolean;
  rows: WeekRow[];
};

/** The band: the date, a dot if it is today, and how many classes. It bleeds
 *  to both edges and pins under the chrome, which is what makes it read as a
 *  break in the scroll rather than a heading floating over some rows. */
export function DayBand({ label, today, count }: { label: string; today?: boolean; count: number }) {
  return (
    <div className="dayband">
      <span className="dayband-d">
        {label}
        {today && <span className="dayband-dot" aria-hidden="true" />}
      </span>
      <span className="dayband-n">
        {count} {count === 1 ? "class" : "classes"}
      </span>
    </div>
  );
}

/** The days, banded. */
export function DayList({ days }: { days: WeekDayRows[] }) {
  return (
    <div className="daylist">
      {days.map((d) => (
        /* The id is the scroll landing: tapping a day in the month grid
           comes back to the list and lands on it. */
        <section key={d.iso} id={`day-${d.iso}`} className="dayblock">
          <DayBand label={d.label} today={d.today} count={d.rows.length} />
          <div className="dayrows">
            {d.rows.map((r) => (
              <ClassLine key={r.key} row={r} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function ClassLine({ row }: { row: WeekRow }) {
  const inner = (
    <>
      {/* The time, in its own column, top-aligned with whatever the row leads
          with. A column of times is scannable in a way a time tucked at the
          end of each line never is: you can find six o'clock without reading
          a single class name.

          The studio under the name carried a pin for a build. It came off: the
          class name above it and the time beside it already say what each line
          is, so the glyph was a mark explaining a thing that was not
          ambiguous, repeated down every row of a long scroll. */}
      <span className="clline-t">
        {row.hm}
        <span className="clline-ap">{row.ap.toUpperCase()}</span>
      </span>
      <span className="clline-main">
        {row.coach && (
          <span className="clline-by">
            <span className="clline-av" style={{ background: row.coach.color }}>
              {row.coach.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={row.coach.photo} alt="" />
              ) : (
                initials(row.coach.name)
              )}
            </span>
            {row.coach.name}
          </span>
        )}
        <span className="clline-nm">{row.name}</span>
        {row.where && (
          <span className="clline-w">{row.where}</span>
        )}
      </span>
    </>
  );
  if (!row.onTap) return <div className="clline">{inner}</div>;
  return (
    <button className="clline" onClick={row.onTap}>
      {inner}
    </button>
  );
}

/** Two letters, because one does not tell four coaches apart on a rail of
 *  circles and a full name does not fit in one. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

/** The dashed block a list with nothing in it draws. It is a screen in its own
 *  right rather than an apology: the first time it offers the thing to do, and
 *  after that it only says there is nothing there. */
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
      <h2 className="wkempty-t">{first ? title : "Nothing coming up"}</h2>
      <p className="wkempty-b">{first ? body : "Nothing on the days ahead."}</p>
      {first && cta && onCta && (
        <button className="btn si wkempty-cta" onClick={onCta}>
          {cta}
        </button>
      )}
    </div>
  );
}

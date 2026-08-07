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
 *   * A band per day, the date at the gutter and a rule under it. It pins
 *     under the chrome, so the day you are looking at is always named.
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
  /** "45 min", gray under the time. Absent on rows that don't know it. */
  dur?: string;
  /** Following only: whose class this is. */
  coach?: { id: string; name: string; color: string; photo: string | null } | null;
  /** A word above the name saying which kind of yours this is: "Shift" on a
   *  date a gym has you on. Which hat comes before what the class is. */
  tag?: string;
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

/** The band: the date, and a dot if it is today. It bleeds to both edges and
 *  pins under the chrome, which is what makes it read as a break in the scroll
 *  rather than a heading floating over some rows.
 *
 *  It counted the day's classes across from the date for a while. That is
 *  arithmetic done at somebody who can see the rows: they are directly
 *  underneath, there are rarely more than three, and a number beside every
 *  heading down a long scroll is a second thing to read on a line whose whole
 *  job is one date. The list said this once before, about the same count on
 *  the same kind of band, and it is worth only saying once more. */
export function DayBand({ label, today }: { label: string; today?: boolean }) {
  // No dot on today, by Matt's call: every band is the date and nothing
  // else. The prop stays so a marker can come back as one line if the flat
  // list turns out to need one.
  void today;
  return (
    <div className="dayband">
      <span className="dayband-d">{label}</span>
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
          <DayBand label={d.label} today={d.today} />
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
      {/* Whose row this is leads, full width over both columns: the by-line
          and the shift tag sat inside the class column for a while, which
          pushed the name down while the time stayed pinned at the top, so
          the two things meant to read as one line never lined up.

          The row itself is the grid, and every cell names its column: the
          time shares a baseline with the name and the length shares one
          with the studio. Every row says its own time, even beside another
          at the same hour, by Matt's call: each is its own box now, and a
          box with a blank time column read as a box missing something
          rather than as a second thing at six. */}
      {row.tag && <span className="clline-tag">{row.tag}</span>}
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
      <span className="clline-t">
        {row.hm}
        <span className="clline-ap">{row.ap.toUpperCase()}</span>
      </span>
      <span className="clline-nm">{row.name}</span>
      {row.dur && <span className="clline-dur">{row.dur}</span>}
      {row.where && (
        <span className="clline-w">{row.where}</span>
      )}
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
      {/* The figure, on every empty state now, by Matt's call: it was the
          first-run welcome only, and "nothing coming up" stood as bare text
          in a dashed box. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="wkempty-fig"
        src="/illustrations/following-empty.png"
        alt=""
        width={356}
        height={600}
      />
      <h2 className="wkempty-t">{first ? title : "Nothing coming up"}</h2>
      <p className="wkempty-b">{first ? body : "Nothing on the days ahead."}</p>
      {/* The call renders whenever the caller offers one: "nothing coming
          up" wants the way to change that as much as the first run does. */}
      {cta && onCta && (
        <button className="btn si wkempty-cta" onClick={onCta}>
          {cta}
        </button>
      )}
    </div>
  );
}

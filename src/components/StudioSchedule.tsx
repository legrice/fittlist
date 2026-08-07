import { clockParts, fmtDayHeaderRel, todayIso } from "@/lib/format";
import { ClassOpener } from "@/components/ClassOpener";

export type StudioDay = {
  iso: string;
  label: string;
  items: {
    id: string;
    name: string;
    startTime: string;
    /** A community row from a coach's own listing: its page lives under
     *  their handle, not the studio. */
    base?: string | null;
    /** A community row distilled from members' entries: it has no page at
     *  all, so it renders as a plain row rather than a link. */
    plain?: boolean;
    /** Who teaches it, on a coach's own listing only. An unclaimed page is
     *  built by the people who train here, and whoever runs the place has no
     *  way to ask about a class without knowing who put it up. A coach's name
     *  is already public on the class it names, so this shows nothing that
     *  was not already showing. A member's entry stays anonymous: the consent
     *  under the personal adder's studio field is that the class joins this
     *  page, not that they do. */
    coachName?: string | null;
    /** Their face and colour, so the coach line is the one Following draws
     *  rather than a bare string. Only ever set where coachName is. */
    coachPhoto?: string | null;
    coachColor?: string | null;
    /** What the class says about where it is, when it says anything: a room
     *  or a floor. Never the studio's own name, which is the page title. */
    where?: string | null;
  }[];
};

/** Two letters, because one does not tell four coaches apart. A local copy of
 *  WeekView's: that module is "use client", and importing a function value
 *  from one into a server component hands back a reference, not a function. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const two = (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
  return (two || name.trim().charAt(0) || "?").toUpperCase();
}

// The gym's own week, on its own page, drawn in the calendar's own grammar:
// the day bands, the .clline rows, the coach as a by-line chip where the
// commons knows one. It wore the old .ps-event card list long after every
// other schedule moved on, which is exactly the drift one row everywhere
// exists to prevent.
//
// No coach names on a claimed gym's rows. A gym's schedule goes out under the
// gym's name, which is what lets somebody teach here without wanting a public
// profile at all; the by-line only appears on the commons' rows, where the
// class is a coach's own listing.
//
// Rows are real links wrapped in ClassOpener, the same as a coach's schedule:
// an ordinary tap opens the class over the list, a modified click or a crawler
// gets the page underneath.
export function StudioSchedule({
  slug,
  days,
  accent,
}: {
  slug: string;
  days: StudioDay[];
  /** The studio's own derived colour: the by-line chip's ground when a
   *  coach's row carries no colour of its own. */
  accent: string;
}) {
  if (days.length === 0) {
    return (
      <div className="empty-block">
        <h2>Nothing on the calendar</h2>
        <p>This studio hasn&rsquo;t posted its classes yet.</p>
      </div>
    );
  }
  const today = todayIso();
  return (
    // The slug is the key classDetail resolves a gym's class by; the /s/
    // prefix belongs to the URL, not to the lookup.
    <ClassOpener handle={slug}>
      <div className="daylist">
        {days.map((d) => (
          <section key={d.iso} id={`day-${d.iso}`} className="dayblock">
            <div className="dayband">
              <span className="dayband-d">{fmtDayHeaderRel(d.iso, today)}</span>
            </div>
            <div className="dayrows">
              {d.items.map((c) => {
                const start = clockParts(c.startTime);
                // Every row says its own time, even beside another at the
                // same hour: each is its own box, the list grammar's rule.
                const rowCls = "clline";
                const inner = (
                  <>
                    {c.coachName && (
                      <span className="clline-by">
                        <span
                          className="clline-av"
                          style={{ background: c.coachColor ?? accent }}
                        >
                          {c.coachPhoto ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={c.coachPhoto} alt="" />
                          ) : (
                            initialsOf(c.coachName)
                          )}
                        </span>
                        {c.coachName}
                      </span>
                    )}
                    <span className="clline-t">
                      {start.hm}
                      <span className="clline-ap">{start.ap.toUpperCase()}</span>
                    </span>
                    <span className="clline-nm">{c.name}</span>
                    {c.where && <span className="clline-w">{c.where}</span>}
                  </>
                );
                if (c.plain) {
                  return (
                    <div key={`${d.iso}-${c.id}`} className={rowCls}>
                      {inner}
                    </div>
                  );
                }
                const href = c.base
                  ? `/${c.base}/${c.id}?d=${d.iso}`
                  : `/s/${slug}/${c.id}?d=${d.iso}`;
                return (
                  <a
                    key={`${d.iso}-${c.id}`}
                    className={rowCls}
                    href={href}
                    data-cid={c.id}
                    data-d={d.iso}
                    data-base={c.base ?? undefined}
                  >
                    {inner}
                  </a>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </ClassOpener>
  );
}

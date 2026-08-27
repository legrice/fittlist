import { clockParts, fmtDayHeaderRel, todayIso } from "@/lib/format";
import { ClassOpener } from "@/components/ClassOpener";
import { CalendarList, type WeekDayRows } from "@/components/WeekView";

export type StudioDay = {
  iso: string;
  label: string;
  items: {
    id: string;
    name: string;
    startTime: string;
    durationMin: number;
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
  const listDays: WeekDayRows[] = days.map((day) => ({
    iso: day.iso,
    label: fmtDayHeaderRel(day.iso, today),
    today: day.iso === today,
    rows: day.items.map((item) => {
      const start = clockParts(item.startTime);
      const base = item.base ?? `s/${slug}`;
      return {
        key: `${day.iso}-${item.id}`,
        name: item.name,
        where: item.where ?? null,
        hm: start.hm,
        ap: start.ap,
        dur: `${item.durationMin} min`,
        coach: item.coachName
          ? {
              id: item.base ?? item.coachName,
              name: item.coachName,
              color: item.coachColor ?? accent,
              photo: item.coachPhoto ?? null,
            }
          : null,
        href: item.plain ? null : `/${base}/${item.id}?d=${day.iso}`,
        classId: item.id,
        iso: day.iso,
        base: item.base ?? undefined,
        menu: item.plain
          ? undefined
          : {
              classId: item.id,
              base,
              iso: day.iso,
              coach: item.coachName && item.base
                ? { name: item.coachName, href: `/${item.base}` }
                : null,
            },
      };
    }),
  }));
  return (
    // The slug is the key classDetail resolves a gym's class by; the /s/
    // prefix belongs to the URL, not to the lookup.
    <ClassOpener handle={slug}>
      <CalendarList days={listDays} className="profile-calendar-list" />
    </ClassOpener>
  );
}

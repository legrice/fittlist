import Link from "next/link";
import { clockParts, todayIso } from "@/lib/format";
import { DayBand } from "@/components/Agenda";
import { ClassOpener } from "@/components/ClassOpener";

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
    /** What the class says about where it is, when it says anything: a room
     *  or a floor. Never the studio's own name, which is the page title. */
    where?: string | null;
  }[];
};

// The gym's own week, on its own page.
//
// No coach names. A gym's schedule goes out under the gym's name, which is
// what lets somebody teach here without wanting a public profile at all, and
// what keeps a schedule from turning into a leaderboard. Showing who is on is
// a separate switch, and the coach has a say in it.
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
  /** The studio's own derived colour, worn on every row's bar: the same one
   *  its directory tile and empty banner wear. */
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
      <div className="ps-week ps-agenda callist">
        {days.map((d) => (
          <div key={d.iso} className="ps-daygroup">
            <DayBand iso={d.iso} today={today} count={d.items.length} />
            <div className="ps-daycards">
              {d.items.map((c) => {
                const start = clockParts(c.startTime);
                const inner = (
                  <>
                    <span className="ps-accent" style={{ background: accent }} aria-hidden="true" />
                    <span className="ps-ebody">
                      {c.coachName?.trim() && (
                        <span className="ps-shifttop ps-tag-added">{c.coachName}</span>
                      )}
                      <span className="ps-enm">{c.name}</span>
                      {c.where?.trim() && (
                        <span className="ps-estudio ps-ewhere">{c.where}</span>
                      )}
                    </span>
                    <span className="ps-etimecol">
                      <span className="ps-etime">
                        {start.hm}
                        <span className="ps-ap">{start.ap}</span>
                      </span>
                      <span className="ps-edur">{c.durationMin} min</span>
                    </span>
                  </>
                );
                // Distilled from members' entries: a fact about the studio
                // with no page behind it and nobody's name on it.
                if (c.plain)
                  return (
                    <div key={`${d.iso}-${c.id}`} className="ps-event ps-event-plain">
                      {inner}
                    </div>
                  );
                return (
                  <Link
                    key={`${d.iso}-${c.id}`}
                    className="ps-event"
                    data-cid={c.id}
                    data-d={d.iso}
                    data-base={c.base ?? undefined}
                    href={c.base ? `/${c.base}/${c.id}?d=${d.iso}` : `/s/${slug}/${c.id}?d=${d.iso}`}
                  >
                    {inner}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </ClassOpener>
  );
}

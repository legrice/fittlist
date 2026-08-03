import { clockParts, todayIso } from "@/lib/format";
import { ClassRow, DayBand } from "@/components/Agenda";
import { ClassCardActions } from "@/components/ClassCardActions";
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
    /** Their face and colour, so the coach line is the one Following draws
     *  rather than a bare string. Only ever set where coachName is. */
    coachPhoto?: string | null;
    coachColor?: string | null;
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
  canAdd = false,
  marks,
}: {
  slug: string;
  days: StudioDay[];
  /** The studio's own derived colour, worn on every row's bar: the same one
   *  its directory tile and empty banner wear. */
  accent: string;
  /** A signed-in member looking at somebody else's place. The row carries the
   *  same Add it carries on Following: a class you found here is a class you
   *  wanted, and until now this was the one list you could not add from. */
  canAdd?: boolean;
  /** `classId|iso` for everything already in their plans. */
  marks?: Set<string>;
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
                const href = c.plain
                  ? null
                  : c.base
                    ? `/${c.base}/${c.id}?d=${d.iso}`
                    : `/s/${slug}/${c.id}?d=${d.iso}`;
                return (
                  <div key={`${d.iso}-${c.id}`} className="ps-erow">
                    {/* The same ClassRow Following and a coach's page draw.
                        This list used to hand-roll its own, which is how the
                        coach line ended up wearing the Added-by-you tag's
                        styling and how the Add button never arrived here. */}
                    <ClassRow
                      item={{
                        key: `${d.iso}-${c.id}`,
                        name: c.name,
                        hm: start.hm,
                        ap: start.ap,
                        durationMin: c.durationMin,
                        where: c.where,
                        coachName: c.coachName,
                        coachPhoto: c.coachPhoto,
                        coachColor: c.coachColor ?? accent,
                        on: marks?.has(`${c.id}|${d.iso}`),
                        href,
                        plain: c.plain,
                        classId: c.id,
                        iso: d.iso,
                        base: c.base ?? undefined,
                      }}
                    />
                    {/* Nothing to add on a plain row: it is a fact about the
                        studio with no class row behind it to mark. */}
                    {!c.plain && (
                      <ClassCardActions
                        classId={c.id}
                        iso={d.iso}
                        name={c.name}
                        canAdd={canAdd}
                        initialOn={!!marks?.has(`${c.id}|${d.iso}`)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </ClassOpener>
  );
}

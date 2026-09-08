import { clockParts, fmtDayHeaderRel, todayIso } from "@/lib/format";
import { ClassOpener } from "@/components/ClassOpener";
import { DayBand } from "@/components/WeekView";
import { ClassCardActions } from "@/components/ClassCardActions";

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
    /** The assigned coach for this occurrence, when the studio names coaches. */
    canSave?: boolean;
    saved?: boolean;
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

/** Public studio schedules share Following's card layout and calendar date bands. */
export function StudioSchedule({ slug, studioName, days, accent }: {
  slug: string;
  studioName: string;
  days: StudioDay[];
  accent: string;
}) {
  if (!days.length) return <div className="empty-block"><h2>Nothing on the calendar</h2><p>This studio hasn&rsquo;t posted its classes yet.</p></div>;
  const today = todayIso();
  return <ClassOpener handle={slug}>
    <div className="calendar-cardlist profile-calendar-list studio-calendar-list daylist">
      {days.map((day) => <section key={day.iso} id={`day-${day.iso}`} className="dayblock">
        <DayBand label={fmtDayHeaderRel(day.iso, today)} today={day.iso === today} />
        <div className="dayrows">
          {day.items.map((item) => {
            const start = clockParts(item.startTime);
            const base = item.base ?? `s/${slug}`;
            const sourceName = item.coachName || studioName;
            const content = <>
              <span className="explore-class-coach">
                <span className="clline-coach-face" style={{ background: item.coachColor ?? accent }}>
                  {item.coachPhoto ? <img src={item.coachPhoto} alt="" loading="lazy" /> : <span>{sourceName.trim().charAt(0) || "?"}</span>}
                </span>
                <span>{sourceName}</span>
              </span>
              <span className="explore-class-time">{start.hm}<small>{start.ap.toUpperCase()}</small></span>
              <strong className="explore-class-name">{item.name}</strong>
              <span className="explore-class-duration">{item.durationMin} min</span>
              <span className="explore-class-studio">{item.where || studioName}</span>
            </>;
            return <article key={`${day.iso}-${item.id}`} className="activity-card calendar-following-card">
              {item.plain ? <div className="activity-card-main">{content}</div> :
                <a className="activity-card-main" href={`/${base}/${item.id}?d=${day.iso}`} data-cid={item.id} data-d={day.iso} data-base={base}>{content}</a>}
              {!item.plain && item.canSave && <div className="explore-save-row">
                <ClassCardActions variant="label" classId={item.id} iso={day.iso} name={item.name} canAdd initialOn={!!item.saved} />
              </div>}
            </article>;
          })}
        </div>
      </section>)}
    </div>
  </ClassOpener>;
}

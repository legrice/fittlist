"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Adder, type AdderPrefill } from "@/components/Adder";
import {
  CalSticky,
  MonthHeadRow,
  MonthScroll,
  ScrollHead,
  monthLabel,
  useScrolledPast,
  useTopDayLabel,
  type MonthCellItem,
} from "@/components/CalendarBits";
import { ClassPeek, type PeekClass } from "@/components/ClassPeek";
import { HighlightOnLand } from "@/components/HighlightOnLand";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";
import { DayList, WeekEmpty, type WeekDayRows } from "@/components/WeekView";
import { clockParts, dayBandLabel, occurrenceEnded, runsOn, timeToMinutes } from "@/lib/format";
import type { ClassDto, LastUsed, StudioDto, TemplateDto } from "@/lib/types";

/**
 * A coach's own calendar: the classes they teach, and nothing else.
 *
 * This screen used to be everybody's calendar. It held what you teach, the
 * shifts a gym had you on, the classes you had saved off somebody else's page
 * and your own private entries, four relationships deep, each with its own
 * colour and its own tap behaviour, and a legend in a sheet to explain them.
 * It is one thing now: what you teach.
 *
 * The shape it wears is the last argument that was still open. It was a week
 * you stepped through with an arrow either side, which capped the calendar at
 * three weeks for no reason the data had and asked somebody to page through a
 * thing they can scroll. It is a continuous list under a title now, with the
 * day bands pinning as you go, and Month is the other way of looking at the
 * same rows rather than a third screen.
 */

/** How far the list runs. Long enough that scrolling is the way to next month
 *  and short enough that a coach with a standing Tuesday is not handed two
 *  hundred identical rows; Month is the view for anything further out. */
const LIST_DAYS = 56;

type View = "list" | "month";

export function CalendarScreen({
  handle,
  classes,
  todayIso,
  studios,
  templates,
  customTypes,
  lastUsed,
  subsCount,
  openAdder = false,
}: {
  /** Your own handle: the base your classes' detail loads from, so the sheet
   *  can show the photograph and the About you wrote, and Share has a URL. */
  handle?: string | null;
  classes: ClassDto[];
  todayIso: string;
  studios: StudioDto[];
  templates: TemplateDto[];
  customTypes: string[];
  lastUsed: LastUsed;
  subsCount: number;
  /** Land with the adder up: `/calendar?add=1`, which is /app's old parameter
   *  carried through its redirect. */
  openAdder?: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState<View>("list");
  const [addOpen, setAddOpen] = useState(openAdder);
  // The overlay header's words: the day under it on the list, the month in
  // view on the grid. The grid's label is set from the first render (this
  // month is in view at rest), so the grid gates the bar on scroll depth
  // instead of on having a label at all.
  const topDay = useTopDayLabel();
  const [ymInView, setYmInView] = useState<string | null>(null);
  const scrolled = useScrolledPast(120);
  // The tapped occurrence, and the editor it can open onto.
  const [peek, setPeek] = useState<PeekClass | null>(null);
  const [edit, setEdit] = useState<{ id: string; prefill: AdderPrefill } | null>(null);
  const [toastMsg, toastOn, toast] = useToast();

  const studioById = useMemo(() => new Map(studios.map((s) => [s.id, s])), [studios]);

  /** Every date from today that holds something, with its rows in time order.
   *  Days with nothing on them never make a block, so a light week reads as a
   *  light week rather than as a wall of empty headings. */
  const days: WeekDayRows[] = useMemo(() => {
    const out: WeekDayRows[] = [];
    const start = Date.parse(`${todayIso}T00:00:00Z`);
    for (let i = 0; i < LIST_DAYS; i++) {
      const d = new Date(start + i * 864e5);
      const iso = d.toISOString().slice(0, 10);
      const dow = (d.getUTCDay() + 6) % 7;
      const rows = classes
        .filter((c) => runsOn(c, iso, dow))
        // Been and gone is not on a schedule. Today keeps the ones still to
        // come and drops the six o'clock you already taught.
        .filter((c) => !occurrenceEnded(iso, c.startTime, c.durationMin))
        .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
        .map((c) => {
          const t = clockParts(c.startTime);
          const st = c.studioId ? studioById.get(c.studioId) : null;
          const where = st?.name ?? c.location ?? null;
          return {
            key: `${c.id}|${iso}`,
            // The landing highlight (?hl from a save toast's See it, or an
            // add note) finds rows by these keys.
            classId: c.id,
            iso,
            name: c.name,
            where,
            hm: t.hm,
            ap: t.ap,
            dur: `${c.durationMin} min`,
            onTap: () => setPeek(peekOf(c, iso, where, st?.slug ? `/s/${st.slug}` : null, handle)),
          };
        });
      if (rows.length)
        out.push({ iso, label: dayBandLabel(iso, todayIso), today: iso === todayIso, rows });
    }
    return out;
  }, [classes, todayIso, studioById, handle]);

  /** The month grid reads the same rows, over its own longer range: it is a
   *  different way of looking at the calendar, not a different calendar. */
  const monthItems = useMemo(() => {
    const m = new Map<string, MonthCellItem[]>();
    const start = Date.parse(`${todayIso}T00:00:00Z`) - 62 * 864e5;
    for (let i = 0; i < 62 + 380; i++) {
      const d = new Date(start + i * 864e5);
      const iso = d.toISOString().slice(0, 10);
      const dow = (d.getUTCDay() + 6) % 7;
      const rows = classes
        .filter((c) => runsOn(c, iso, dow))
        .map((c) => ({
          kind: "coaching" as const,
          name: c.name,
          at: timeToMinutes(c.startTime),
        }))
        .sort((a, b) => a.at - b.at);
      if (rows.length) m.set(iso, rows);
    }
    return m;
  }, [classes, todayIso]);

  // Tapping a day in the grid goes back to the list and lands on it. The grid
  // answers "what does the month look like"; a day is a list of classes, and
  // that is a thing the list already draws well.
  const openDay = useCallback((iso: string) => {
    setView("list");
    requestAnimationFrame(() => {
      document.getElementById(`day-${iso}`)?.scrollIntoView({ block: "start" });
    });
  }, []);

  // Whether this coach has published anything at all, not whether the next
  // eight weeks do: the empty state offers the thing to do only when there is
  // nothing on their coaching calendar.
  const bare = classes.length === 0;

  return (
    <>
      {/* "See it" from a save toast lands here with ?hl: light the row. */}
      <HighlightOnLand />
      {/* The card starts right under the app header, and the title and the
          view switch are the first things inside it. */}
      <div className="cardwrap">
      {/* The title and the two ways of looking, pinned under the app header.
          `CalSticky` publishes its own height as `--dayband-top`, which is
          where every day band underneath pins: one writer for that number,
          because two screens working it out separately is how they end up
          disagreeing by a few pixels nobody can explain. */}
      <CalSticky>
        {/* Calendar and its two views share one title row. The screen is
            coaching-only, so there is no relationship filter to explain. */}
        <div className="calbar">
          <h1 className="calbar-t caltitle tab-page-title">Your schedule</h1>
          {/* Two glyphs rather than two words. A list and a month grid both
              draw themselves in an icon better than they name themselves: the
              shapes are the answer, where "List" and "Month" are two labels
              you read to find out which one you are on. The words stay as the
              accessible names, because a glyph on its own says nothing to a
              screen reader. */}
          {!bare && (
            <div className="calbar-tools">
              <div className="calseg" role="tablist" aria-label="Schedule view">
                <button
                  role="tab"
                  aria-label="List"
                  aria-selected={view === "list"}
                  className={view === "list" ? "on" : ""}
                  onClick={() => {
                    // Coming back from the month, land at the top of the
                    // list: the month scroll can be months deep, and a
                    // shorter view inherits that offset as a random landing.
                    if (view !== "list") window.scrollTo({ top: 0 });
                    setView("list");
                  }}
                >
                  <Icon name="calendar_view_day" size={25} />
                </button>
                <button
                  role="tab"
                  aria-label="Month"
                  aria-selected={view === "month"}
                  className={view === "month" ? "on" : ""}
                  onClick={() => {
                    // A view switch swaps what is in front of you and moves
                    // nothing: arriving mid-scroll slid the card over the
                    // header, which read as the calendar going full screen.
                    if (view !== "month") window.scrollTo({ top: 0 });
                    setView("month");
                  }}
                >
                  <Icon name="calendar_view_month" size={25} />
                </button>
              </div>
              {/* No Share door here any more, by Matt's call: an arrow in
                  the corner was one thing too many and nobody could say
                  what it did. The Share tab is the way to the hub. */}
            </div>
          )}
        </div>
        {view === "month" && <MonthHeadRow />}
      </CalSticky>

      {bare ? (
        <WeekEmpty
          first
          title="Your schedule is empty"
          body="Put the classes you teach up here. That is the whole app: your week, at one link, kept current."
          cta="Add a class"
          onCta={() => setAddOpen(true)}
        />
      ) : view === "month" ? (
        <MonthScroll
          todayIso={todayIso}
          items={monthItems}
          onDay={openDay}
          onMonthInView={setYmInView}
        />
      ) : days.length === 0 ? (
        // A week that has run its course still offers the one act that
        // changes it: the same Add the title row carries, where somebody
        // reading "nothing coming up" is already looking.
        <WeekEmpty first={false} title="" body="" cta="Add a class" onCta={() => setAddOpen(true)} />
      ) : (
        <div className="calendar-cardlist">
          <DayList days={days} />
        </div>
      )}
      </div>

      {/* The overlay header: nothing at rest, a glass bar once you're deep,
          naming the day (or month) under it with the toggle and Add along
          for the ride, so the two things the title row offered are never a
          long scroll away. */}
      {!bare && (
        <ScrollHead
          on={view === "month" ? scrolled : !!topDay}
          label={
            view === "month"
              ? ymInView
                ? monthLabel(ymInView, todayIso)
                : ""
              : topDay
          }
          sub={view === "month" ? <MonthHeadRow /> : undefined}
        >
          <div className="calseg" role="tablist" aria-label="Schedule view, overlay">
            <button
              role="tab"
              aria-label="List"
              aria-selected={view === "list"}
              className={view === "list" ? "on" : ""}
              onClick={() => {
                window.scrollTo({ top: 0 });
                setView("list");
              }}
            >
              <Icon name="calendar_view_day" size={25} />
            </button>
            <button
              role="tab"
              aria-label="Month"
              aria-selected={view === "month"}
              className={view === "month" ? "on" : ""}
              onClick={() => {
                window.scrollTo({ top: 0 });
                setView("month");
              }}
            >
              <Icon name="calendar_view_month" size={25} />
            </button>
          </div>
        </ScrollHead>
      )}

      {/* Add floats bottom right, under the thumb, the same spot and dress
          as Following's search: adding is what somebody opens this screen
          to do, and the title row's corner belongs to Share now. */}
      {!bare && (
        <button className="wkfab" aria-label="Add a class" onClick={() => setAddOpen(true)}>
          <Icon name="add" size={28} />
        </button>
      )}
      {addOpen && (
        <Adder
          studios={studios}
          templates={templates}
          customTypes={customTypes}
          lastUsed={lastUsed}
          subsCount={subsCount}
          firstPublish={bare}
          onClose={() => setAddOpen(false)}
          onToast={toast}
          onPublished={(msg) => {
            setAddOpen(false);
            toast(msg);
            router.refresh();
          }}
          onDeleted={(msg) => {
            setAddOpen(false);
            toast(msg);
            router.refresh();
          }}
        />
      )}
      {peek && (
        <ClassPeek
          cls={peek}
          onClose={() => setPeek(null)}
          onToast={toast}
          onChanged={() => router.refresh()}
          onEdit={() => {
            const c = classes.find((x) => x.id === peek.id);
            setPeek(null);
            if (c) setEdit({ id: c.id, prefill: prefillOf(c) });
          }}
        />
      )}

      {edit && (
        <Adder
          studios={studios}
          templates={templates}
          customTypes={customTypes}
          lastUsed={lastUsed}
          subsCount={subsCount}
          firstPublish={false}
          prefill={edit.prefill}
          onClose={() => setEdit(null)}
          onToast={toast}
          onPublished={(msg) => {
            setEdit(null);
            toast(msg);
            router.refresh();
          }}
          onDeleted={(msg) => {
            setEdit(null);
            toast(msg);
            router.refresh();
          }}
        />
      )}
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}

/** The tapped occurrence, as the sheet wants it. It lives here rather than in
 *  the sheet because only the caller knows which date was tapped. */
function peekOf(
  c: ClassDto,
  iso: string,
  where: string | null,
  whereHref: string | null,
  handle?: string | null,
): PeekClass {
  const d = new Date(`${iso}T00:00:00Z`);
  // Title case, because it is a value in the facts list and reads beside
  // "6:00 pm" and "Ironbound Performance Athletics", not above them.
  const dow = d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  const md = d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const t = clockParts(c.startTime);
  return {
    id: c.id,
    iso,
    name: c.name,
    when: `${dow}, ${md}`,
    time: `${t.hm} ${t.ap.toLowerCase()}`,
    studio: where,
    studioHref: whereHref,
    repeats: c.specificDate ? "Once" : "Weekly",
    // A gym's class you are on the rota for. It is on this calendar and it is
    // not yours to edit, cancel or delete: the studio owns it, and what a
    // coach can do with a date they are on is give it up or hand it over.
    shift: c.shift,
    // A shift's page lives under the studio, because that is who owns it.
    base: c.shift ? (c.shiftBase ? `s/${c.shiftBase}` : undefined) : (handle ?? undefined),
    mine: true,
  };
}

/** The editor, opened on this class and this date. */
function prefillOf(c: ClassDto): AdderPrefill {
  return {
    name: c.name,
    classType: c.classType,
    description: c.description,
    startTime: c.startTime,
    durationMin: c.durationMin,
    studioId: c.studioId,
    location: c.location,
    isPublic: c.isPublic,
    links: c.links.map((l) => ({ ...l })),
    days: [c.dayOfWeek],
    dayOfWeek: c.dayOfWeek,
    endsOn: c.endsOn,
    specificDate: c.specificDate,
    classId: c.id,
  };
}

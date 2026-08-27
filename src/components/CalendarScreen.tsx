"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { AdderPrefill } from "@/components/Adder";
import {
  CalSticky,
  MonthHeadRow,
  MonthScroll,
  ScrollHead,
  monthLabel,
  useScrolledPast,
  type MonthCellItem,
} from "@/components/CalendarBits";
import type { PeekClass } from "@/components/ClassPeek";
import { BodyPortal } from "@/components/BodyPortal";
import { HighlightOnLand } from "@/components/HighlightOnLand";
import { Icon } from "@/components/Icon";
import { AddWeekChoices } from "@/components/AddWeekChoices";
import type { HubItem } from "@/components/ShareHubScreen";
import { Toast, useToast } from "@/components/Toast";
import { CalendarList, WeekEmpty, type WeekDayRows } from "@/components/WeekView";
import { clockParts, dayBandLabel, occurrenceEnded, runsOn, timeToMinutes } from "@/lib/format";
import type { ClassDto, StudioDto, TemplateDto } from "@/lib/types";
import type { WeekDay as WeekDayData, WeekItem } from "@/lib/week";
import { setGoing } from "@/app/actions/going";
import { setTeaching } from "@/app/actions/auth";
import { removePersonalClass, type PersonalDetail, type PersonalMatch } from "@/app/actions/personal";
import { loadCalendarComposerData, loadCalendarShareData, type CalendarComposerData } from "@/app/actions/calendar-data";

const Adder = dynamic(() => import("@/components/Adder").then((module) => module.Adder));
const AddBrowse = dynamic(() => import("@/components/AddBrowse").then((module) => module.AddBrowse));
const ClassPeek = dynamic(() => import("@/components/ClassPeek").then((module) => module.ClassPeek));
const PlanSheet = dynamic(() => import("@/components/PlanSheet").then((module) => module.PlanSheet));
const ShareHubScreen = dynamic(() => import("@/components/ShareHubScreen").then((module) => module.ShareHubScreen));

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

type View = "list" | "month";
type CalendarFilter = "all" | "coaching" | "saved" | "personal";

const prefillFromTemplate = (template: TemplateDto): AdderPrefill => ({
  ...template,
  days: [],
});

/**
 * A coach can still have an older personal copy of a class after the studio
 * starts owning that same slot. Covers and manager conflict overrides can
 * then make both records eligible for the coach's calendar. They are two
 * records, but one real class occurrence, so prefer the studio-owned shift.
 */
function uniqueCoachingOccurrences(rows: ClassDto[], studioById: Map<string, StudioDto>) {
  const bySlot = new Map<string, ClassDto>();
  for (const row of rows) {
    // coachweek identifies the exact legacy pair when it can. Keeping that
    // copy out also covers dates where the canonical series is skipped.
    if (row.duplicateOf) continue;
    // Old coach-owned copies can store the studio as free text while the
    // managed copy stores its studio id. Resolve both to what the calendar
    // actually displays so those records compare as the same place.
    const place = (row.studioId ? studioById.get(row.studioId)?.name : row.location)
      ?.trim()
      .toLocaleLowerCase() ?? "";
    const name = row.name.trim().toLocaleLowerCase();
    const slot = `${place}|${name}|${row.startTime}`;
    const current = bySlot.get(slot);
    if (!current || (row.shift && !current.shift)) bySlot.set(slot, row);
  }
  return [...bySlot.values()];
}

export function CalendarScreen({
  handle,
  viewer,
  classes,
  todayIso,
  studios,
  savedDays = [],
  openAdder = false,
  member = false,
}: {
  /** Your own handle: the base your classes' detail loads from, so the sheet
   *  can show the photograph and the About you wrote, and Share has a URL. */
  handle?: string | null;
  /** Your own attribution, shown on the classes you coach just as it is on
   *  Following. */
  viewer: { id: string; name: string; photo: string | null; color: string };
  classes: ClassDto[];
  todayIso: string;
  studios: StudioDto[];
  savedDays?: WeekDayData[];
  /** Members use this exact calendar too, but every row is attending. They
   *  have no relationship filter and Add opens the catalog directly. */
  member?: boolean;
  /** Land with the adder up: `/calendar?add=1`, which is /app's old parameter
   *  carried through its redirect. */
  openAdder?: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState<View>("list");
  const [filter, setFilter] = useState<CalendarFilter>("all");
  const [addChoice, setAddChoice] = useState(openAdder);
  const [addChoiceKind, setAddChoiceKind] = useState<"coaching" | "saved" | "personal" | null>(null);
  const [addChoiceStep, setAddChoiceStep] = useState<"role" | "regular">("role");
  const [addOpen, setAddOpen] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [personalAdd, setPersonalAdd] = useState(false);
  const [personalWorkout, setPersonalWorkout] = useState(false);
  const [quickPrefill, setQuickPrefill] = useState<AdderPrefill | null>(null);
  const [addDate, setAddDate] = useState<string | null>(null);
  const [match, setMatch] = useState<PersonalMatch | null>(null);
  const [gone, setGone] = useState<Record<string, boolean>>({});
  const [removeConfirm, setRemoveConfirm] = useState<{
    key: string;
    classId: string;
    iso: string;
    name: string;
    personalId?: string;
  } | null>(null);
  const [, startRemove] = useTransition();
  const [enablingCoach, startEnablingCoach] = useTransition();
  // The month grid uses a fixed weekday rail once the page has scrolled.
  // Day view relies on its actual date bands as sticky headers instead of
  // rendering a second, competing overlay.
  const [ymInView, setYmInView] = useState<string | null>(null);
  const [dayHorizon, setDayHorizon] = useState(56);
  const [monthHorizon, setMonthHorizon] = useState(12);
  const dayMoreRef = useRef<HTMLButtonElement>(null);
  const lastAutoDayCount = useRef(-1);
  const scrolled = useScrolledPast(120);
  // The tapped occurrence, and the editor it can open onto.
  const [peek, setPeek] = useState<PeekClass | null>(null);
  const [plan, setPlan] = useState<string | null>(null);
  const [planEdit, setPlanEdit] = useState<{ id: string; prefill: AdderPrefill } | null>(null);
  const [edit, setEdit] = useState<{ id: string; prefill: AdderPrefill } | null>(null);
  const [toastMsg, toastOn, toast] = useToast();
  const [shareOpen, setShareOpen] = useState(false);
  const [composerData, setComposerData] = useState<CalendarComposerData | null>(null);
  const [shareData, setShareData] = useState<{ items:HubItem[]; defaultFrom:string; savedHeadline:string; savedBackground:string | null } | null>(null);
  const [loadingTools, startTools] = useTransition();
  const [calendarStateLoaded, setCalendarStateLoaded] = useState(false);
  const calendarStateKey = `fl-calendar-state:${viewer.id}`;
  const visible = {
    coaching: !member && (filter === "all" || filter === "coaching"),
    saved: filter === "all" || filter === "saved",
    personal: filter === "all" || filter === "personal",
  };

  useEffect(() => {
    if (openAdder) {
      setAddChoiceStep("role");
      setAddChoice(true);
    }
  }, [openAdder]);

  useEffect(() => {
    const openFromDesktop = () => {
      setAddChoiceStep("role");
      setAddChoice(true);
    };
    window.addEventListener("fittlist:add-class", openFromDesktop);
    return () => window.removeEventListener("fittlist:add-class", openFromDesktop);
  }, []);

  const ensureComposer = useCallback(() => {
    if (composerData) return;
    startTools(async () => {
      const data = await loadCalendarComposerData();
      if (data) setComposerData(data);
    });
  }, [composerData]);
  const openShare = () => {
    setShareOpen(true);
    ensureComposer();
    if (!shareData) startTools(async () => {
      const data = await loadCalendarShareData();
      if (data) setShareData(data);
    });
  };
  useEffect(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(calendarStateKey) ?? "null");
      if (stored && typeof stored === "object") {
        const state = stored as { view?: unknown; filter?: unknown; visible?: Record<string, unknown> };
        if (state.view === "list" || state.view === "month") setView(state.view);
        if (state.filter === "all" || state.filter === "coaching" || state.filter === "saved" || state.filter === "personal")
          setFilter(member && state.filter === "coaching" ? "all" : state.filter);
        else if (state.visible) {
          const legacy = (["coaching", "saved", "personal"] as const).filter((key) => state.visible?.[key] === true);
          setFilter(legacy.length === 1 && !(member && legacy[0] === "coaching") ? legacy[0] : "all");
        }
      }
    } catch { /* malformed or unavailable storage */ }
    setCalendarStateLoaded(true);
  }, [calendarStateKey, member]);

  useEffect(() => {
    if (!calendarStateLoaded) return;
    try { localStorage.setItem(calendarStateKey, JSON.stringify({ view, filter })); } catch { /* private mode */ }
  }, [calendarStateKey, calendarStateLoaded, filter, view]);

  useEffect(() => {
    if (!shareOpen) return;
    document.body.classList.add("sheet-open");
    window.dispatchEvent(new CustomEvent("fittlist:takeover", { detail: true }));
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setShareOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.classList.remove("sheet-open");
      window.dispatchEvent(new CustomEvent("fittlist:takeover", { detail: false }));
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [shareOpen]);

  const studioById = useMemo(() => new Map(studios.map((s) => [s.id, s])), [studios]);
  const savedByIso = useMemo(() => {
    const byIso = new Map(
      savedDays.map((day) => [
        day.iso,
        day.items.filter((item) => !gone[`added|${item.personal ? item.id : item.classId}|${item.iso}`]),
      ] as const),
    );
    const personal = new Map<string, WeekItem>();
    for (const day of savedDays)
      for (const item of day.items)
        if (item.personal && item.repeatDay !== undefined && !item.specificDate) personal.set(item.id, item);
    const start = new Date(`${todayIso}T00:00:00Z`);
    const through = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + monthHorizon + 1, 1));
    const dayThrough = new Date(start);
    dayThrough.setUTCDate(start.getUTCDate() + dayHorizon);
    if (dayThrough > through) through.setTime(dayThrough.getTime());
    for (const item of personal.values()) {
      const firstOffset = ((item.repeatDay! - ((start.getUTCDay() + 6) % 7)) + 7) % 7;
      const cursor = new Date(start);
      cursor.setUTCDate(start.getUTCDate() + firstOffset);
      while (cursor < through) {
        const iso = cursor.toISOString().slice(0, 10);
        if (item.endsOn && iso > item.endsOn) break;
        const key = `added|${item.id}|${iso}`;
        if (!gone[key]) {
          const list = byIso.get(iso) ?? [];
          if (!list.some((entry) => entry.personal && entry.id === item.id))
            byIso.set(iso, [...list, { ...item, iso, dayLabel: dayBandLabel(iso, todayIso) }]);
        }
        cursor.setUTCDate(cursor.getUTCDate() + 7);
      }
    }
    return byIso;
  }, [savedDays, gone, todayIso, dayHorizon, monthHorizon]);
  const atOf = (r: { hm: string; ap: string }) => {
    const [h, m] = r.hm.split(":").map(Number);
    return ((h % 12) + (r.ap.toLowerCase() === "pm" ? 12 : 0)) * 60 + (m || 0);
  };

  /** Every date from today that holds something, with its rows in time order.
   *  Days with nothing on them never make a block, so a light week reads as a
   *  light week rather than as a wall of empty headings. */
  const days: WeekDayRows[] = useMemo(() => {
    const out: WeekDayRows[] = [];
    const start = Date.parse(`${todayIso}T00:00:00Z`);
    // The horizon grows as the end approaches. This keeps first paint small
    // without placing a product limit on how far ahead somebody can plan.
    for (let i = 0; i < dayHorizon; i++) {
      const d = new Date(start + i * 864e5);
      const iso = d.toISOString().slice(0, 10);
      const dow = (d.getUTCDay() + 6) % 7;
      const coachingRows = uniqueCoachingOccurrences(
        classes.filter((c) => runsOn(c, iso, dow)),
        studioById,
      )
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
            coach: viewer,
            tag: c.shift ? "Shift" : "Coaching",
            tagTone: c.shift ? "shift" as const : "coaching" as const,
            onTap: () => setPeek(peekOf(c, iso, where, st?.slug ? `/s/${st.slug}` : null, handle)),
          };
        });
      const addedRows = (savedByIso.get(iso) ?? []).map((i) => {
        const key = `added|${i.personal ? i.id : i.classId}|${i.iso}`;
        return {
        key,
        classId: i.personal ? undefined : i.classId,
        iso: i.iso,
        name: i.name,
        where: i.where,
        hm: i.hm,
        ap: i.ap,
        dur: `${i.durationMin} min`,
        coach: i.personal
          ? null
          : i.coachName
            ? { id: i.classId, name: i.coachName, color: i.coachColor, photo: i.coachPhoto }
            : null,
        tag: i.personal ? "Personal" : "Saved",
        tagTone: i.personal ? "personal" as const : "attending" as const,
        onTap: i.personal
          ? () => setPlan(i.id)
          : () => setPeek(peekOfAdded(i)),
        corner: (
          <button
            className="following-add on calendar-attending-check"
            type="button"
            aria-label={`Remove ${i.name} from your schedule`}
            onClick={() =>
              setRemoveConfirm({
                key,
                classId: i.classId,
                iso: i.iso,
                name: i.name,
                personalId: i.personal ? i.id : undefined,
              })
            }
          >
            <Icon name="check" size={24} />
          </button>
        ),
      };
      });
      const rows = [
        ...(visible.coaching ? coachingRows : []),
        ...addedRows.filter((row) => row.tagTone === "personal" ? visible.personal : visible.saved),
      ].sort((a, b) => atOf(a) - atOf(b));
      if (rows.length) out.push({ iso, label: dayBandLabel(iso, todayIso), today: iso === todayIso, rows });
    }
    return out;
  }, [classes, todayIso, studioById, handle, visible.coaching, visible.personal, visible.saved, savedByIso, viewer, dayHorizon]);

  /** The month grid reads the same rows, over its own longer range: it is a
   *  different way of looking at the calendar, not a different calendar. */
  const monthItems = useMemo(() => {
    const m = new Map<string, MonthCellItem[]>();
    const start = Date.parse(`${todayIso}T00:00:00Z`) - 62 * 864e5;
    const [year, month] = todayIso.slice(0, 7).split("-").map(Number);
    const rangeEnd = Date.UTC(year, month - 1 + monthHorizon + 1, 1);
    const rangeDays = Math.ceil((rangeEnd - start) / 864e5);
    for (let i = 0; i < rangeDays; i++) {
      const d = new Date(start + i * 864e5);
      const iso = d.toISOString().slice(0, 10);
      const dow = (d.getUTCDay() + 6) % 7;
      const coachingRows = uniqueCoachingOccurrences(
        classes.filter((c) => runsOn(c, iso, dow)),
        studioById,
      )
        .map((c) => ({
          kind: "coaching" as const,
          name: c.name,
          at: timeToMinutes(c.startTime),
        }))
        .sort((a, b) => a.at - b.at);
      const addedRows = (savedByIso.get(iso) ?? []).map((i) => ({
        kind: (i.personal ? "private" : "added") as "private" | "added",
        name: i.name,
        at: atOf(i),
      }));
      const rows = [
        ...(visible.coaching ? coachingRows : []),
        ...addedRows.filter((row) => row.kind === "private" ? visible.personal : visible.saved),
      ].sort((a, b) => a.at - b.at);
      if (rows.length) m.set(iso, rows);
    }
    return m;
  }, [classes, todayIso, studioById, visible.coaching, visible.personal, visible.saved, savedByIso, monthHorizon]);

  useEffect(() => {
    if (view !== "list") return;
    if (days.length <= lastAutoDayCount.current) return;
    lastAutoDayCount.current = days.length;
    const target = dayMoreRef.current;
    if (!target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setDayHorizon((value) => value + 84);
    }, { rootMargin: "600px 0px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [view, dayHorizon, days.length]);

  // Tapping a day in the grid goes back to the list and lands on it. The grid
  // answers "what does the month look like"; a day is a list of classes, and
  // that is a thing the list already draws well.
  const openDay = useCallback((iso: string) => {
    if (!monthItems.has(iso)) {
      ensureComposer();
      setQuickPrefill(null);
      setAddDate(iso);
      setAddChoiceKind(null);
      setAddChoiceStep("role");
      setAddChoice(true);
      return;
    }
    const offset = Math.max(0, Math.floor((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${todayIso}T00:00:00Z`)) / 864e5));
    if (offset >= dayHorizon) setDayHorizon(offset + 28);
    setView("list");
    requestAnimationFrame(() => {
      document.getElementById(`day-${iso}`)?.scrollIntoView({ block: "start" });
    });
  }, [ensureComposer, monthItems, todayIso, dayHorizon]);

  // Whether this coach has published anything at all, not whether the next
  // eight weeks do: the empty state offers the thing to do only when there is
  // nothing on their coaching calendar.
  const bare = classes.length === 0 && savedDays.every((day) => day.items.length === 0);
  const openAdd = () => {
    ensureComposer();
    setQuickPrefill(null);
    setAddDate(null);
    setAddChoiceKind(null);
    setAddChoiceStep("role");
    setAddChoice(true);
  };
  const openNewCoachingClass = () => {
    setAddChoice(false);
    setPersonalAdd(false);
    setPersonalWorkout(false);
    setAddOpen(true);
  };
  const continueAdd = () => {
    if (!addChoiceKind) return;
    if (addChoiceKind === "coaching" && member && bare) {
      startEnablingCoach(async () => {
        const result = await setTeaching(true);
        if (!result.ok) {
          toast(result.error ?? "Couldn’t turn on coaching");
          return;
        }
        if (composerData?.templates.some((template) => template.isPublic))
          setAddChoiceStep("regular");
        else openNewCoachingClass();
      });
      return;
    }
    if (addChoiceKind === "coaching") {
      if (composerData?.templates.some((template) => template.isPublic))
        setAddChoiceStep("regular");
      else openNewCoachingClass();
      return;
    }
    setAddChoice(false);
    if (addChoiceKind === "saved") setBrowseOpen(true);
    else {
      setPersonalAdd(true);
      setPersonalWorkout(true);
      setAddOpen(true);
    }
  };

  return (
    <>
      {/* "See it" from a save toast lands here with ?hl: light the row. */}
      <HighlightOnLand />
      <header className="calendar-page-header calendar-page-actions">
        <h1>My calendar</h1>
        <div className="calendar-desktop-controls">
          <label className="calendar-desktop-filter">
            <span className="sr-only">View calendar</span>
            <select value={filter} onChange={(event) => setFilter(event.target.value as CalendarFilter)}>
              <option value="all">View: All</option>
              {!member && <option value="coaching">View: Coaching</option>}
              <option value="saved">View: Saved</option>
              <option value="personal">View: Personal</option>
            </select>
          </label>
          <div className="calendar-desktop-view" role="group" aria-label="Calendar view">
            <button type="button" className={view === "list" ? "on" : ""} aria-pressed={view === "list"} onClick={() => setView("list")}>Day</button>
            <button type="button" className={view === "month" ? "on" : ""} aria-pressed={view === "month"} onClick={() => setView("month")}>Month</button>
          </div>
        </div>
        <button type="button" className="calendar-header-share" aria-label="Share your week" onClick={openShare} disabled={loadingTools && shareOpen}><Icon name="reply" className="share-arrow-forward" size={20} /><span>Share</span></button>
      </header>

      <div className="cardwrap calendar-cardwrap">
      {/* The title and the two ways of looking, pinned under the app header.
          `CalSticky` publishes its own height as `--dayband-top`, which is
          where every day band underneath pins: one writer for that number,
          because two screens working it out separately is how they end up
          disagreeing by a few pixels nobody can explain. */}
      <CalSticky>
        {view === "month" && <MonthHeadRow />}
      </CalSticky>

      {bare ? (
        <WeekEmpty
          first
          title="This is your calendar"
          body={member
            ? "Follow a coach to find classes and start building your calendar."
            : "Follow people whose classes you want to see, or add the first class you teach."
          }
          actions={member ? (
            <div className="calendar-empty-actions calendar-empty-actions-member">
              <Link className="btn si" href="/discover">Find a coach to follow</Link>
            </div>
          ) : (
            <div className="calendar-empty-actions">
              <Link className="btn ghost" href="/discover">Find someone to follow</Link>
              <button className="btn si" type="button" onClick={openAdd}>Add your first class</button>
            </div>
          )}
        />
      ) : view === "month" ? (
        <MonthScroll
          todayIso={todayIso}
          items={monthItems}
          onDay={openDay}
          onMonthInView={setYmInView}
          monthsAhead={monthHorizon}
          onNeedMore={() => setMonthHorizon((value) => value + 12)}
        />
      ) : (
        <>
          {days.length ? (
            <CalendarList className="personal-calendar-list" days={days} />
          ) : (
            <WeekEmpty first title="Nothing showing" body="Keep looking ahead, choose another view, or add something to your calendar." />
          )}
          <button ref={dayMoreRef} className="calendar-load-more" type="button" onClick={() => setDayHorizon((value) => value + 84)}>
            Show more dates
          </button>
        </>
      )}
      </div>

      {shareOpen && (
        <BodyPortal>
          <div
            className="sheet-scrim calendar-share-scrim"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setShareOpen(false);
            }}
          >
            <section
              className="sheet calendar-share-sheet"
              role="dialog"
              aria-modal="true"
              aria-label="Share your week"
            >
              <button
                type="button"
                className="sheetclose calendar-share-close"
                aria-label="Close share editor"
                onClick={() => setShareOpen(false)}
              >
                <Icon name="close" size={24} />
              </button>
              {shareData ? <ShareHubScreen
                embedded
                coach={!member}
                handle={handle ?? ""}
                name={viewer.name}
                items={shareData.items}
                defaultFrom={shareData.defaultFrom}
                today={todayIso}
                savedHeadline={shareData.savedHeadline}
                savedBackground={shareData.savedBackground}
                studios={studios}
                templates={composerData?.templates ?? []}
                customTypes={composerData?.customTypes ?? []}
                lastUsed={composerData?.lastUsed ?? { startTime:"06:00", durationMin:50, studioId:studios[0]?.id ?? null }}
              /> : <div className="calendar-tool-loading" aria-busy="true">Loading your share options…</div>}
            </section>
          </div>
        </BodyPortal>
      )}

      {/* Month view needs its weekday rail fixed above the grid. Day view
          uses the real date bands as sticky headers so there is only one
          date label competing for the top edge while scrolling. */}
      {!bare && days.length > 0 && view === "month" && (
        <ScrollHead
          on={scrolled}
          label={ymInView ? monthLabel(ymInView, todayIso) : ""}
          sub={<MonthHeadRow />}
        />
      )}

      <BodyPortal>
        <div className="calendar-bottom-actions" aria-label="Schedule actions">
          {!bare && (
            <button className="calendar-bottom-add" aria-label="Add to your schedule" onClick={openAdd}>
              <Icon name="add" size={28} />
            </button>
          )}
        </div>
      </BodyPortal>
      {addChoice && (
        <div className="sheet-scrim" onClick={(e) => { if (e.target === e.currentTarget) setAddChoice(false); }}>
          <div className="sheet addrole-sheet" role="dialog" aria-modal="true" aria-labelledby="addrole-title">
            {addChoiceStep === "regular" && (
              <button className="iconbtn addrole-back" aria-label="Back" onClick={() => setAddChoiceStep("role")}>
                <Icon name="arrow_back" size={20} />
              </button>
            )}
            <button className="iconbtn sheetclose" aria-label="Close" onClick={() => setAddChoice(false)}>
              <Icon name="close" size={18} />
            </button>
            {addChoiceStep === "role" ? (
              <>
                <h2 id="addrole-title">Add to your week</h2>
                <p className="lead">What are you doing?</p>
                <AddWeekChoices
                  canCoach={!member || bare}
                  coachDetail={member && bare ? "I also coach" : undefined}
                  disabled={enablingCoach}
                  selected={addChoiceKind}
                  onSelect={setAddChoiceKind}
                />
                <button type="button" className="addrole-continue" disabled={!addChoiceKind || enablingCoach || (addChoiceKind === "coaching" && loadingTools)} onClick={continueAdd}>{enablingCoach ? "Turning on coaching…" : addChoiceKind === "coaching" && loadingTools ? "Finding your classes…" : "Continue"}</button>
              </>
            ) : (
              <>
                <h2 id="addrole-title">Add again</h2>
                <p>Start with a class you already use.</p>
                <section className="calendar-quick-add calendar-quick-add-step" aria-label="Your regular classes">
                  <div>
                  {(composerData?.templates ?? []).filter((template) => template.isPublic).slice(0, 4).map((template) => {
                    const studio = template.studioId ? studioById.get(template.studioId) : null;
                    return (
                      <button
                        type="button"
                        key={`${template.name}|${template.studioId ?? template.location ?? ""}`}
                        onClick={() => {
                          setQuickPrefill({
                            ...prefillFromTemplate(template),
                            ...(addDate ? { specificDate: addDate } : {}),
                          });
                          setAddDate(null);
                          setAddChoice(false);
                          setPersonalAdd(false);
                          setPersonalWorkout(false);
                          setAddOpen(true);
                        }}
                      >
                        <span><b>{template.name}</b><small>{studio?.name ?? template.location ?? "Your class"}</small></span>
                        <Icon name="chevron_right" size={19} />
                      </button>
                    );
                  })}
                  </div>
                </section>
                <button type="button" className="addrole-new-class" onClick={openNewCoachingClass}>
                  <span><Icon name="add" size={20} /> New class</span>
                  <Icon name="chevron_right" size={19} />
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {browseOpen && (
        <AddBrowse
          onClose={() => setBrowseOpen(false)}
          onAddNew={() => {
            setBrowseOpen(false);
            setPersonalAdd(true);
            setPersonalWorkout(false);
            setAddOpen(true);
          }}
          onEvent={() => {
            setBrowseOpen(false);
            setPersonalAdd(true);
            setPersonalWorkout(true);
            setAddOpen(true);
          }}
          onNotice={(message, highlight) => {
            toast(message);
            if (highlight) router.refresh();
          }}
        />
      )}
      {addOpen && composerData && (
        <Adder
          studios={studios}
          templates={composerData.templates}
          customTypes={composerData.customTypes}
          lastUsed={composerData.lastUsed}
          subsCount={composerData.subsCount}
          firstPublish={bare}
          prefill={quickPrefill ?? (addDate ? {
            name: "",
            startTime: composerData.lastUsed.startTime,
            durationMin: composerData.lastUsed.durationMin,
            studioId: composerData.lastUsed.studioId,
            links: [],
            specificDate: addDate,
          } : undefined)}
          personal={
            personalAdd
              ? { canCoach: false, event: personalWorkout, oneOff: true }
              : undefined
          }
          onClose={() => {
            setAddOpen(false);
            setQuickPrefill(null);
            setAddDate(null);
            setPersonalAdd(false);
            setPersonalWorkout(false);
          }}
          onToast={toast}
          onPublished={(msg, _planId, _live, focus) => {
            setAddOpen(false);
            setQuickPrefill(null);
            setAddDate(null);
            setPersonalAdd(false);
            setPersonalWorkout(false);
            toast(msg);
            if (focus) {
              // A new class can land outside the saved view or in Month view.
              // Put the calendar in the one state where its exact row is
              // visible, then let HighlightOnLand scroll to and light it.
              setFilter("all");
              setView("list");
              try {
                localStorage.setItem(calendarStateKey, JSON.stringify({ view: "list", filter: "all" }));
              } catch { /* private mode */ }
              router.replace(`/calendar?hl=${encodeURIComponent(`${focus.id}.${focus.iso}`)}`, { scroll: false });
            } else {
              router.refresh();
            }
          }}
          onDeleted={(msg) => {
            setAddOpen(false);
            setQuickPrefill(null);
            setAddDate(null);
            setPersonalAdd(false);
            toast(msg);
            router.refresh();
          }}
          onMatch={(found) => {
            setAddOpen(false);
            setMatch(found);
          }}
        />
      )}
      {addOpen && !composerData && (
        <div className="sheet-scrim"><div className="sheet calendar-tool-loading" aria-busy="true">Loading your class tools…</div></div>
      )}
      {match && (
        <div className="sheet-scrim" onClick={(event) => { if (event.target === event.currentTarget) setMatch(null); }}>
          <div className="sheet confirmsheet" role="dialog" aria-modal="true">
            <h2>That class is already on FittList</h2>
            <p className="lead">
              {match.name} with {match.coachName} is already listed at that time and place. Add the existing class so updates stay in sync.
            </p>
            <div className="publishwrap nostick">
              <button
                className="btn si"
                onClick={() => startRemove(async () => {
                  const result = await setGoing(match.classId, match.iso, true);
                  if (!result.ok) {
                    toast(result.error ?? "Couldn't add that");
                    return;
                  }
                  toast(`${match.name} was saved to your calendar`);
                  setMatch(null);
                  router.refresh();
                })}
              >
                Add existing class
              </button>
              <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => setMatch(null)}>Go back</button>
            </div>
          </div>
        </div>
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
            if (c) { ensureComposer(); setEdit({ id: c.id, prefill: prefillOf(c) }); }
          }}
        />
      )}

      {plan && (
        <PlanSheet
          id={plan}
          onClose={() => setPlan(null)}
          onToast={toast}
          onRemoved={(message) => {
            setPlan(null);
            toast(message);
            router.refresh();
          }}
          onEdit={(personal) => {
            setPlan(null);
            ensureComposer();
            setPlanEdit({ id: personal.id, prefill: personalPrefill(personal) });
          }}
        />
      )}

      {planEdit && composerData && (
        <Adder
          studios={studios}
          templates={composerData.templates}
          customTypes={composerData.customTypes}
          lastUsed={composerData.lastUsed}
          subsCount={composerData.subsCount}
          firstPublish={false}
          personal={{ canCoach: !member, editId: planEdit.id }}
          prefill={planEdit.prefill}
          onClose={() => setPlanEdit(null)}
          onToast={toast}
          onPublished={(message) => {
            setPlanEdit(null);
            toast(message);
            router.refresh();
          }}
          onDeleted={(message) => {
            setPlanEdit(null);
            toast(message);
            router.refresh();
          }}
        />
      )}

      {edit && composerData && (
        <Adder
          studios={studios}
          templates={composerData.templates}
          customTypes={composerData.customTypes}
          lastUsed={composerData.lastUsed}
          subsCount={composerData.subsCount}
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
      {removeConfirm && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setRemoveConfirm(null);
          }}
        >
          <div className="sheet confirmsheet">
            <h2>Remove this from your calendar?</h2>
            <p className="lead">
              {removeConfirm.name} comes off your schedule. You can add it again from the catalog.
            </p>
            <div className="publishwrap nostick">
              <button
                className="btn si"
                onClick={() => {
                  const item = removeConfirm;
                  setRemoveConfirm(null);
                  setGone((current) => ({ ...current, [item.key]: true }));
                  startRemove(async () => {
                    const result = item.personalId
                      ? await removePersonalClass(item.personalId)
                      : await setGoing(item.classId, item.iso, false);
                    if (!result.ok) {
                      setGone((current) => ({ ...current, [item.key]: false }));
                      toast(result.error ?? "Couldn't remove that");
                      return;
                    }
                    toast(`${item.name} was removed from your schedule`);
                    router.refresh();
                  });
                }}
              >
                Remove it
              </button>
              <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => setRemoveConfirm(null)}>
                Keep it
              </button>
            </div>
          </div>
        </div>
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

/** A catalog class already on this calendar opens the same modern peek as it
 *  does from Following. The row has enough to paint the first frame; the
 *  sheet loads its image, About, booking links and RSVP state behind it. */
function peekOfAdded(item: WeekItem): PeekClass {
  const d = new Date(`${item.iso}T00:00:00Z`);
  const dow = d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  const md = d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return {
    id: item.classId,
    iso: item.iso,
    name: item.name,
    when: `${dow}, ${md}`,
    time: `${item.hm} ${item.ap.toLowerCase()}`,
    studio: item.where,
    coach: item.coachName
      ? {
          name: item.coachName,
          handle: item.handle || null,
          photo: item.coachPhoto,
          color: item.coachColor,
        }
      : null,
    base: item.handle,
    saved: true,
    mine: false,
  };
}

function personalPrefill(item: PersonalDetail): AdderPrefill {
  return {
    name: item.name,
    classType: item.classType,
    description: item.description,
    image: item.image,
    startTime: item.startTime,
    durationMin: item.durationMin,
    studioId: item.studioId,
    location: item.location,
    withWho: item.withWho,
    links: item.links,
    days: [item.dayOfWeek],
    dayOfWeek: item.dayOfWeek,
    endsOn: item.endsOn,
    specificDate: item.specificDate,
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

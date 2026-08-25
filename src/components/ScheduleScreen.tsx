"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  clockParts,
  fmtDayHeader,
  fmtDayHeaderRel,
  occurrenceEnded,
  runsOn,
  timeToMinutes,
} from "@/lib/format";
import type { Circle } from "@/lib/circles";
import { CircleTray } from "@/components/CircleTray";
import type { ClassDto, LastUsed, StudioDto, TemplateDto } from "@/lib/types";
import type { WeekDay, WeekItem } from "@/lib/week";
import { Adder, type AdderPrefill } from "@/components/Adder";
import { AgendaAvatar, DayBand } from "@/components/Agenda";
import { HighlightOnLand } from "@/components/HighlightOnLand";
import { ClassLiveSheet } from "@/components/ClassLiveSheet";
import { ClassPeekLoader } from "@/components/ClassPeekLoader";
import { PlanSheet } from "@/components/PlanSheet";
import { mergeIntoGym } from "@/app/actions/gym";
import type { PersonalMatch } from "@/app/actions/personal";
import { setGoing } from "@/app/actions/going";
import { AppHeader } from "@/components/AppHeader";
import { NavBar } from "@/components/NavBar";
import { avatarColor } from "@/lib/avatar";
import {
  CalBottomBar,
  CalEmpty,
  CalHead,
  CalShare,
  CalSticky,
  DayGrid,
  DayStrip,
  KindFilterSheet,
  MiniCalPicker,
  MONTHS_AHEAD,
  MONTHS_BACK,
  MonthHeadRow,
  MonthScroll,
  ViewSheet,
  useListMonthSpy,
  type DayGridEvent,
  loadCalView,
  monthLabel,
  saveCalView,
  scrollCalTop,
  scrollToToday,
  type CalKind,
  type CalView,
  type MonthCellItem,
} from "@/components/CalendarBits";
import { Icon } from "@/components/Icon";
import { InvitesBanner } from "@/components/InvitesBanner";
import { Toast, useToast } from "@/components/Toast";

// The list shows the whole horizon its data covers: nine weeks, which is
// what `myWeek` expands personal entries across, so the two halves of the
// calendar agree about how far forward "forward" goes. There is no View
// more button; a calendar you have to ask for more of is a calendar you
// fight. It can still stretch past this on demand, silently, when a day
// tapped in the Month grid lies beyond it.
const INITIAL_WEEKS = 9;
const MAX_WEEKS = 52;
// And backwards: scrolling up reveals what has been, to the loaded window.

type CalDay = {
  iso: string;
  label: string;
  items: ClassDto[];
  extras: WeekItem[];
  past?: boolean;
};

export function ScheduleScreen({
  classes,
  hasAnyClass,
  todayIso,
  studios,
  templates,
  customTypes,
  lastUsed,
  subsCount,
  plans,
  circles,
  autoOpenAdder,
  handle,
  name,
  photo,
  invitesLeft,
  showFanView,
  landing,
  userId,
  myColor,
}: {
  classes: ClassDto[];
  hasAnyClass: boolean;
  todayIso: string;
  studios: StudioDto[];
  templates: TemplateDto[];
  customTypes: string[];
  lastUsed: LastUsed;
  subsCount: number;
  /** The classes they're going to and their own entries, from the same loader
   *  the member calendar uses: You is one calendar of everything now, and the
   *  rows wear Coaching, Going, Shift or Yours to say which hat. */
  plans: WeekDay[];
  /** Everyone they follow, as faces above the calendar. Same tray a member
   *  wears, because a coach follows coaches. */
  circles: Circle[];
  autoOpenAdder: boolean;
  handle: string;
  /** For the You tab's face on the bottom bar, nothing else. */
  name: string;
  photo: string | null;
  invitesLeft: number;
  showFanView: boolean;
  /** Where the wordmark goes: the landing tab, or /app without the member
   *  side. One answer, so it can't point at a tab this viewer hasn't got. */
  landing: string;
  userId: string;
  myColor: string | null;
}) {
  const router = useRouter();
  const [adder, setAdder] = useState<{ open: boolean; prefill?: AdderPrefill }>({ open: false });
  // The plus asks which hat: a class you're coaching goes to your page, a
  // class you're going to stays yours. Pre-answered here, so the form itself
  // doesn't have to ask again.
  const [addMenu, setAddMenu] = useState(false);
  const [personalOpen, setPersonalOpen] = useState(false);
  // The add sheet's third answer: not a class at all, just yours.
  const [personalEvent, setPersonalEvent] = useState(false);
  // One of your own entries, opened; then the same form on that row.
  const [plan, setPlan] = useState<string | null>(null);
  const [planEdit, setPlanEdit] = useState<{ id: string; prefill: AdderPrefill } | null>(null);
  // A going mark's class, opened as the sheet it opens as everywhere.
  const [going, setGoingOpen] = useState<{ base: string; classId: string; iso: string } | null>(null);
  // "That class is on fittlist": the real one, offered over a typed copy.
  const [match, setMatch] = useState<{ m: PersonalMatch; again: () => void } | null>(null);
  // Just published: the sheet that offers handing the new class on, while
  // the moment is warm.
  const [live, setLive] = useState<{ id: string; name: string } | null>(null);
  const [pBusy, setPBusy] = useState(false);
  // Which kinds are switched off, in the sheet behind the header's filter
  // glyph. Everything is on by default, and off on arrival resets: a
  // filter is a way of looking, not a fact worth storing. The view is
  // different: a preference, so it survives arrival.
  const [offKinds, setOffKinds] = useState<Set<CalKind>>(new Set());
  const [filterSheet, setFilterSheet] = useState(false);
  const kindOn = (k: CalKind) => !offKinds.has(k);
  const toggleKind = (k: CalKind) =>
    setOffKinds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  const [view, setView] = useState<CalView>("list");
  useEffect(() => setView(loadCalView()), []);
  const [viewSheet, setViewSheet] = useState(false);
  // The mini calendar behind the month's chevron.
  const [pickerOpen, setPickerOpen] = useState(false);
  // The month the grid is looking at; entering Month starts at today's.
  const [ym, setYm] = useState(todayIso.slice(0, 7));
  // The Day view's day. Entering it starts at today.
  const [dayIso, setDayIso] = useState(todayIso);
  const pickView = (v: CalView) => {
    if (v === "month") setYm(todayIso.slice(0, 7));
    if (v === "day") {
      setDayIso(todayIso);
      setYm(todayIso.slice(0, 7));
      scrollCalTop();
    }
    setView(v);
    saveCalView(v);
  };
  const [weeks, setWeeks] = useState(INITIAL_WEEKS);
  // Scrolling up reveals the past, a couple of weeks at a time.
  // The Share pill at the bottom: the menu of ways, then the story sheet.
  // A Going row just removed by its ribbon, held while the undo is offered.
  const [removed, setRemoved] = useState<{ classId: string; iso: string; name: string } | null>(
    null,
  );
  const removedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (removedTimer.current) clearTimeout(removedTimer.current); }, []);
  const removeGoing = (p: WeekItem) => {
    startMerge(async () => {
      const res = await setGoing(p.classId, p.iso, false);
      if (!res.ok) {
        toast(res.error ?? "Couldn't remove that");
        return;
      }
      setRemoved({ classId: p.classId, iso: p.iso, name: p.name });
      if (removedTimer.current) clearTimeout(removedTimer.current);
      removedTimer.current = setTimeout(() => setRemoved(null), 6000);
      router.refresh();
    });
  };
  const undoRemove = () => {
    const r = removed;
    if (!r) return;
    setRemoved(null);
    if (removedTimer.current) clearTimeout(removedTimer.current);
    startMerge(async () => {
      const res = await setGoing(r.classId, r.iso, true);
      if (!res.ok) {
        toast(res.error ?? "Couldn't undo that");
        return;
      }
      router.refresh();
    });
  };
  // The coach's own colour marks the classes they teach.
  const myAccent = avatarColor({ id: userId, avatarColor: myColor });
  const [toastMsg, toastOn, toast] = useToast();

  useEffect(() => {
    if (autoOpenAdder) {
      setAdder({ open: true });
      window.history.replaceState(null, "", "/app");
    }
  }, [autoOpenAdder]);

  // ?edit=<classId> arrives from tapping a class on your own public page: the
  // one thing you'd do with your class from there is change it, and this is
  // where the editor lives.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const editId = params.get("edit");
    if (!editId) return;
    const c = classes.find((x) => x.id === editId);
    if (c) edit(c, params.get("d") ?? undefined);
    window.history.replaceState(null, "", "/app");
    // Once, on arrival. `classes` and `edit` are fresh on mount, which is the
    // only render this can fire on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clear any leftover slide-direction flag now that we're back on the
  // schedule. The account itself is the You tab now; nothing here opens it.
  useEffect(() => {
    sessionStorage.removeItem("fl-nav");
  }, []);

  const studioById = useMemo(() => new Map(studios.map((s) => [s.id, s])), [studios]);

  const edit = (c: ClassDto, onIso?: string) => {
    // A weekly class is stored as one row per day; editing it should load every
    // day it recurs on (its template's weekly rows), not just the tapped day. A
    // one-off is a single dated row.
    // Grouped by series, not template: the template is keyed on the class name,
    // so the same class at two studios shares one. Grouping by it pulled the
    // other studio's days into this editor and saved them onto this class.
    const days = c.specificDate
      ? [c.dayOfWeek]
      : [
          ...new Set(
            classes
              .filter((x) => !x.specificDate && x.seriesId === c.seriesId)
              .map((x) => x.dayOfWeek),
          ),
        ];
    setAdder({
      open: true,
      prefill: {
        name: c.name,
        classType: c.classType,
        description: c.description,
        startTime: c.startTime,
        durationMin: c.durationMin,
        studioId: c.studioId,
        location: c.location,
        isPublic: c.isPublic,
        links: c.links.map((l) => ({ ...l })),
        days,
        dayOfWeek: c.dayOfWeek,
        endsOn: c.endsOn,
        occurrenceDate: onIso ?? null,
        specificDate: c.specificDate,
        classId: c.id,
      },
    });
  };

  // The calendar: every date from today forward that has classes - weekly
  // classes recur on their weekday, one-offs land on their date. "A week" is
  // seven POPULATED days, not seven calendar days, so a Mon/Wed/Fri schedule
  // fills the screen rather than showing three rows; the calendar horizon
  // caps the walk so an empty schedule doesn't scan a year.
  // A shift belongs to the gym, so tapping it opens the class rather than the
  // adder: it isn't this coach's to edit, and what they *can* do with it (give
  // the date up, take an open one) lives on the class itself.
  const [shiftOpen, setShiftOpen] = useState<{
    base: string;
    classId: string;
    iso: string;
  } | null>(null);

  // Their own copy of a slot the gym now runs. Nobody sees it twice (every
  // public surface already shows the gym's and hides this), but it is still
  // their row, and this is the only screen they can hand it over from.
  const [dupe, setDupe] = useState<ClassDto | null>(null);
  const [merging, startMerge] = useTransition();
  const handOver = () => {
    if (!dupe || merging) return;
    const c = dupe;
    startMerge(async () => {
      const res = await mergeIntoGym(c.id);
      if (!res.ok) {
        toast(res.error ?? "Couldn't do that");
        return;
      }
      setDupe(null);
      toast(res.moved ? "Handed over, and everyone kept their spot" : "Handed over");
      router.refresh();
    });
  };

  // "6:15" + "pm" back to minutes, so a class you teach and a class you're
  // going to can sort into one day by when they actually are.
  const planMinutes = (p: WeekItem) => {
    const [h, m] = p.hm.split(":").map(Number);
    return ((h % 12) + (p.ap.toLowerCase() === "pm" ? 12 : 0)) * 60 + (m || 0);
  };
  // A filter is only offered where it can narrow something: which kinds this
  // calendar actually holds. Coaching covers shifts too; a shift is you
  // working, whoever owns the row.
  const presentKinds = useMemo(() => {
    const seen = new Set<CalKind>();
    if (classes.length) seen.add("coaching");
    for (const d of plans) for (const p of d.items) seen.add(p.personal ? "private" : "added");
    return seen;
  }, [classes, plans]);

  // Nothing on the calendar at all: no class they teach, no shift, nothing
  // they added, nothing of their own. Not the same as "nothing coming up",
  // which is a week that has run its course and keeps the chrome, and not the
  // same as a filter hiding everything, which is a way of looking.
  const bare = classes.length === 0 && plans.every((d) => d.items.length === 0);

  const days = useMemo(() => {
    const plansByIso = new Map(plans.map((d) => [d.iso, d.items]));
    const start = new Date(`${todayIso}T00:00:00Z`);
    const out: CalDay[] = [];
    for (let i = 0; i < MAX_WEEKS * 7 && out.length < weeks * 7; i++) {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + i);
      const iso = d.toISOString().slice(0, 10);
      const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
      const items = kindOn("coaching")
        ? classes
            .filter((c) => runsOn(c, iso, dow))
            // Been and gone: once the hour has passed the row comes off,
            // here and on every other schedule, the same as a member's week.
            .filter((c) => !occurrenceEnded(iso, c.startTime, c.durationMin))
            .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
        : [];
      // The other half of your calendar: the classes you added and your own
      // entries, from the same loader the member calendar reads.
      const extras = (plansByIso.get(iso) ?? []).filter((p) =>
        kindOn(p.personal ? "private" : "added"),
      );
      if (items.length || extras.length) {
        // "Today", "Tomorrow", then "Monday — Jul 20".
        out.push({ iso, label: fmtDayHeaderRel(iso, todayIso), items, extras });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes, plans, todayIso, weeks, offKinds]);

  // The days already run, and the List no longer holds any of them: it starts
  // at today and stops there. It used to grow upward as the scroll asked for
  // it, and that stopped paying the moment the tray arrived. The faces are the
  // top of this screen and the whole of what a follow buys, so a list that
  // grows above them puts them a mile up a scroll nobody wants to make, which
  // makes the walk back not worth taking either.
  //
  // The record is not lost and this is why the trade is fair: the Month grid
  // still dims past days rather than dropping them, and Day view shows any
  // date at all, so both reach what has been without a scroll. The past will
  // get a home of its own; this is deleting the wrong door, not the room.
  const pastDays: CalDay[] = [];

  // The title follows the List's scroll the same way it follows the
  // months': whichever day is under the header names the month.
  useListMonthSpy(view === "list", setYm, `${pastDays.length}|${days.length}`);

  // The Day view's hours: both hats on the picked day, each event opening
  // what its row would (the editor, the class sheet, the plan sheet).
  const dayEvents = useMemo<DayGridEvent[]>(() => {
    const out: DayGridEvent[] = [];
    const dow = (new Date(`${dayIso}T00:00:00Z`).getUTCDay() + 6) % 7;
    if (kindOn("coaching"))
      for (const c of classes)
        if (runsOn(c, dayIso, dow)) {
          const studio = c.studioId ? studioById.get(c.studioId) : undefined;
          out.push({
            key: `c-${c.id}`,
            kind: "coaching",
            name: c.name,
            at: timeToMinutes(c.startTime),
            durationMin: c.durationMin,
            where: studio ? studio.name : c.location,
            onTap: () =>
              c.shift
                ? c.shiftBase && setShiftOpen({ base: c.shiftBase, classId: c.id, iso: dayIso })
                : c.duplicateOf
                  ? setDupe(c)
                  : edit(c, dayIso),
          });
        }
    for (const p of plans.find((d) => d.iso === dayIso)?.items ?? []) {
      const k: CalKind = p.personal ? "private" : "added";
      if (!kindOn(k)) continue;
      out.push({
        key: `p-${p.id}-${p.iso}`,
        kind: k,
        name: p.name,
        at: planMinutes(p),
        durationMin: p.durationMin,
        where: p.where,
        onTap: () =>
          p.personal
            ? setPlan(p.id)
            : setGoingOpen({ base: p.handle, classId: p.classId, iso: p.iso }),
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes, plans, dayIso, offKinds, studioById]);

  // The months, whole: every date the scroll's range holds, kinds filtered
  // the same way. No ended-filter here: the grid can look back, and a day
  // that has been dims rather than disappears.
  const monthItems = useMemo(() => {
    const map = new Map<string, MonthCellItem[]>();
    const plansByIso = new Map(plans.map((d) => [d.iso, d.items]));
    const start = new Date(`${todayIso.slice(0, 7)}-01T00:00:00Z`);
    start.setUTCMonth(start.getUTCMonth() - MONTHS_BACK);
    const end = new Date(`${todayIso.slice(0, 7)}-01T00:00:00Z`);
    end.setUTCMonth(end.getUTCMonth() + MONTHS_AHEAD + 1);
    for (const d = new Date(start); d < end; d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      const dow = (d.getUTCDay() + 6) % 7;
      const rows: MonthCellItem[] = [];
      if (kindOn("coaching"))
        for (const c of classes)
          if (runsOn(c, iso, dow))
            rows.push({ kind: "coaching", name: c.name, at: timeToMinutes(c.startTime) });
      for (const p of plansByIso.get(iso) ?? []) {
        const k: CalKind = p.personal ? "private" : "added";
        if (kindOn(k)) rows.push({ kind: k, name: p.name, at: planMinutes(p) });
      }
      rows.sort((a, b) => a.at - b.at);
      if (rows.length) map.set(iso, rows);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes, plans, todayIso, offKinds]);

  // A day tapped on the grid lands on that day in the list: make sure the
  // list reaches it, switch, and scroll once it's painted.
  const openDay = (iso: string) => {
    const diff = Math.ceil(
      (new Date(`${iso}T00:00:00Z`).getTime() - new Date(`${todayIso}T00:00:00Z`).getTime()) /
        86400000,
    );
    setWeeks((w) => Math.min(MAX_WEEKS, Math.max(w, Math.ceil((diff + 1) / 7) + 1)));
    pickView("list");
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        document.getElementById(`day-${iso}`)?.scrollIntoView({ block: "start", behavior: "smooth" }),
      ),
    );
  };

  // A date picked in the mini calendar jumps the view that's open: the Day
  // view moves its selection, the Month scroll lands on that month, and
  // the List scrolls to the day. A past date from the List opens Day
  // instead, because Day is the one view that can show any date and the
  // List only grows into the past as the scroll asks for it.
  const pickDate = (iso: string) => {
    if (view === "day") {
      setDayIso(iso);
      setYm(iso.slice(0, 7));
    } else if (view === "month") {
      setYm(iso.slice(0, 7));
      requestAnimationFrame(() =>
        document
          .getElementById(`month-${iso.slice(0, 7)}`)
          ?.scrollIntoView({ block: "start", behavior: "smooth" }),
      );
    } else if (iso < todayIso) {
      pickView("day");
      setDayIso(iso);
      setYm(iso.slice(0, 7));
    } else {
      openDay(iso);
    }
  };

  return (
    <section className={`screen${showFanView ? " hasnav" : ""}`}>
      <HighlightOnLand />
      <div className="pad" style={{ paddingTop: 14, paddingBottom: showFanView ? 150 : 110 }}>
        <AppHeader
          home={showFanView ? landing : "/app"}
          // Only where the bottom bar is: without the member side there are no
          // tabs to show, on any width.
          nav={showFanView ? { active: "calendar", scheduleHref: "/calendar" } : undefined}
        />

        {invitesLeft !== 0 && <InvitesBanner />}

        {/* The faces, above everything and scrolling away with the page.
            Outside the `bare` gate on purpose: a calendar with nothing on it
            and five circles above it is the exact state where the tray is the
            thing to tap. */}
        <CircleTray circles={circles} />

        {/* The calendar's own header, pinned under the app's: the month at
            the gutter, the view and filter glyphs with the plus across from
            it, and the divider underneath. The list scrolls beneath it. */}
        {!bare && (
        <CalSticky>
          <CalHead
            label={monthLabel(ym, todayIso)}
            view={view}
            onMenu={() => setViewSheet(true)}
            onFilter={() => setFilterSheet(true)}
            onTitle={() => setPickerOpen((o) => !o)}
            pickerOpen={pickerOpen}
          >
            {/* Share took the corner Add used to hold: a thumb can't
                reach up here, and adding is what this screen is for. */}
            <CalShare onShare={() => router.push("/share")} />
          </CalHead>
          {/* The weekday initials pin with the chrome while the months
              scroll beneath; the Day view pins its week strip in the same
              spot. */}
          {view === "month" && <MonthHeadRow />}
          {view === "day" && (
            <DayStrip
              dayIso={dayIso}
              todayIso={todayIso}
              onPick={(iso) => {
                setDayIso(iso);
                setYm(iso.slice(0, 7));
              }}
            />
          )}
          {pickerOpen && (
            <MiniCalPicker
              ym={ym}
              dayIso={view === "day" ? dayIso : todayIso}
              todayIso={todayIso}
              hasDot={(iso) => monthItems.has(iso)}
              onPick={pickDate}
              onClose={() => setPickerOpen(false)}
            />
          )}
        </CalSticky>
        )}
        {bare ? (
          <CalEmpty
            body="Add the classes you coach and they land on your public page."
            addLabel="Add your first class"
            onAdd={() => setAdder({ open: true })}
          />
        ) : view === "month" ? (
          <MonthScroll
            todayIso={todayIso}
            items={monthItems}
            onDay={openDay}
            onMonthInView={setYm}
          />
        ) : view === "day" ? (
          <>
            <h3 className="daygrid-head">{fmtDayHeaderRel(dayIso, todayIso)}</h3>
            <DayGrid dayIso={dayIso} events={dayEvents} />
          </>
        ) : (
          <>
            {days.length === 0 && pastDays.length === 0 ? (
              <p className="ps-none">Nothing coming up. Add a class to fill your calendar.</p>
            ) : (
            <div className="ps-week ps-agenda callist">
              {[...pastDays, ...days].map((d) => (
                <div
                  key={d.iso}
                  id={`day-${d.iso}`}
                  className={`ps-daygroup${d.past ? " ps-pastday" : ""}`}
                >
                  {/* Both hats counted, because both are drawn under it. */}
                  <DayBand iso={d.iso} today={todayIso} />
                  <div className="ps-daycards">
                    {/* Every row here carries its occurrence's two keys
                        (data-cid, data-d), so "See it" can find the one it
                        means on landing. A member's rows get them from
                        ClassRow; this list builds its own markup, and was
                        the one place the highlight went blind. */}
                    {/* One day, both hats, in time order: the classes you
                        teach and the ones you're going to are one calendar. */}
                    {[
                      ...d.items.map((c) => ({ at: timeToMinutes(c.startTime), c, p: null as WeekItem | null })),
                      ...d.extras.map((p) => ({ at: planMinutes(p), c: null as ClassDto | null, p })),
                    ]
                      .sort((a, b) => a.at - b.at)
                      .map((row) => {
                      if (row.p) {
                        const p = row.p;
                        return (
                          <div key={`plan-${d.iso}-${p.id}`} className="ps-erow">
                          <button
                            className={`ps-event ev-${p.personal ? "private" : "added"}`}
                            data-plan={p.personal ? "yours" : "going"}
                            data-cid={p.personal ? undefined : p.classId}
                            data-d={p.iso}
                            onClick={() =>
                              p.personal
                                ? setPlan(p.id)
                                : setGoingOpen({ base: p.handle, classId: p.classId, iso: p.iso })
                            }
                          >
                            {/* The bar the kind colours; without it the card
                                has no edge to say what this row is to you. */}
                            <span className="ps-accent" aria-hidden="true" />
                            {/* One of your own has no face and wears its
                                colour as a plain disc; a saved class wears
                                the coach's, which is how you place it. */}
                            {p.personal ? (
                              <span className="ps-eav ps-eav-private" aria-hidden="true" />
                            ) : (
                              <AgendaAvatar
                                photo={p.coachPhoto}
                                name={p.coachName || "?"}
                                color={p.coachColor}
                                cls="ps-eav"
                              />
                            )}
                            <span className="ps-ebody">
                              <span className="ps-ewho">
                                {/* A personal row can name who it is with;
                                    the corner chip already says it is yours,
                                    so the line carries the name when there is
                                    one. */}
                                {p.coachName?.trim() ||
                                  (p.personal ? "You added this" : "")}
                              </span>
                              <span className="ps-enm">{p.name}</span>
                              <span className="ps-emeta">
                                {[`${p.hm}${p.ap.toLowerCase()}`, `${p.durationMin} min`, p.where]
                                  .filter(Boolean)
                                  .join(" \u00b7 ")}
                              </span>
                            </span>
                            {/* Personal takes the corner, because a row you
                                typed is not one you can save. A saved class
                                leaves it for the ribbon. */}
                            {p.personal && <span className="ps-chip ps-chip-private">Personal</span>}
                          </button>
                          {/* The filled ribbon: this class is in your
                              schedule, and tapping it takes it out, with the
                              undo in the toast. A sibling, never a child. */}
                          {!p.personal && (
                            <button
                              className="evcard-add on"
                              aria-label={`Saved ${p.name}. Tap to remove it from your schedule.`}
                              onClick={() => removeGoing(p)}
                            >
                              <Icon name="bookmark_added" size={22} />
                            </button>
                          )}
                          </div>
                        );
                      }
                      const c = row.c!;
                      const studio = c.studioId ? studioById.get(c.studioId) : undefined;
                      const where = studio ? studio.name : c.location;
                      const start = clockParts(c.startTime);
                      return (
                        <div key={`${d.iso}-${c.id}`} className="ps-erow">
                        <button
                          className={`ps-event ev-coaching${c.isPublic ? "" : " ps-event-private"}`}
                          data-cid={c.id}
                          // The pair, the same way the plan rows carry it: the
                          // id alone says which class and not which of its
                          // dates, so anything addressing an occurrence (the
                          // add highlight, a suite checking one week came off)
                          // was left counting rows and hoping.
                          data-d={d.iso}
                          onClick={() =>
                            c.shift
                              ? c.shiftBase &&
                                setShiftOpen({ base: c.shiftBase, classId: c.id, iso: d.iso })
                              : c.duplicateOf
                                ? setDupe(c)
                                : edit(c, d.iso)
                          }
                        >
                          {/* The kind colours the bar (CSS by ev-class); an
                              inline colour here would override it. */}
                          <span className="ps-accent" aria-hidden="true" />
                          {/* Your own face on your own teaching rows, and a
                              shift's is yours too: a gym's class is the gym's,
                              but the person on the rota looking at their own
                              calendar is looking at their own day. */}
                          <AgendaAvatar photo={photo} name={name} color={myAccent} cls="ps-eav" />
                          <span className="ps-ebody">
                            <span className="ps-ewho">
                              {/* Shift says so where the coach's name goes on
                                  a saved row: whose hat this is, before what
                                  it is. */}
                              {c.shift ? "Covering a shift" : name}
                            </span>
                            <span className="ps-enm">
                              {c.name}
                              {/* The name line keeps the facts about the class
                                  itself. */}
                              {!c.isPublic && <span className="ps-private">Private</span>}
                              {c.duplicateOf && <span className="ps-dupe">Duplicate</span>}
                            </span>
                            <span className="ps-emeta">
                              {[`${start.hm}${start.ap.toLowerCase()}`, `${c.durationMin} min`, where]
                                .filter(Boolean)
                                .join(" \u00b7 ")}
                            </span>
                          </span>
                          {/* Teaching, in the corner the ribbon takes on a row
                              you can save. You cannot save your own class, so
                              the slot is free to say what it is instead. */}
                          <span className={`ps-chip ${c.shift ? "ps-chip-shift" : "ps-chip-coaching"}`}>
                            {c.shift ? "Shift" : "Teaching"}
                          </span>
                        </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            )}
          </>
        )}
      </div>

      {dupe && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDupe(null);
          }}
        >
          <div className="sheet">
            <button className="iconbtn sheetclose" aria-label="Close" onClick={() => setDupe(null)}>
              <Icon name="close" size={18} />
            </button>
            <h2>{dupe.name} is the gym&rsquo;s now</h2>
            <div className="dupebox">
              <p className="dupebox-s">
                You listed this before the studio ran its own schedule, so there are two of them.
                Yours is already hidden from your page and your share, and the studio&rsquo;s is
                what people see. Hand yours over and anyone who added it keeps their spot.
              </p>
              <div className="publishwrap nostick">
                <button className="btn si" disabled={merging} onClick={handOver}>
                  {merging ? "One moment…" : "Hand it over"}
                </button>
              </div>
              {/* The pairing is name, day, time and place. If it caught two
                  different classes in two rooms, this is the way out. */}
              <button
                className="tertiary tellsheet-done"
                disabled={merging}
                onClick={() => {
                  const c = dupe;
                  setDupe(null);
                  edit(c);
                }}
              >
                It&rsquo;s not the same class
              </button>
            </div>
          </div>
        </div>
      )}

      {shiftOpen && (
        <ClassPeekLoader
          base={shiftOpen.base}
          classId={shiftOpen.classId}
          iso={shiftOpen.iso}
          onClose={() => setShiftOpen(null)}
          onChanged={() => router.refresh()}
        />
      )}

      {/* Which hat this one goes on. The form used to ask mid-flight; the
          plus asks first, and the form gets a straight answer. */}
      {addMenu && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setAddMenu(false);
          }}
        >
          <div className="sheet">
            <button className="iconbtn sheetclose" aria-label="Close" onClick={() => setAddMenu(false)}>
              <Icon name="close" size={18} />
            </button>
            <h2>Add to your calendar</h2>
            <div className="settingslist ownermenu">
              <button
                className="setrow"
                onClick={() => {
                  setAddMenu(false);
                  setAdder({ open: true });
                }}
              >
                <span className="setrow-ic"><Icon name="campaign" size={24} /></span>
                <span className="setrow-txt">
                  <span className="t">
                    A class you&rsquo;re coaching <span className="addtag">Public</span>
                  </span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
              </button>
              <button
                className="setrow"
                onClick={() => {
                  setAddMenu(false);
                  setPersonalEvent(false);
                  setPersonalOpen(true);
                }}
              >
                <span className="setrow-ic"><Icon name="add_circle" size={24} /></span>
                <span className="setrow-txt">
                  <span className="t">
                    A class you&rsquo;re going to <span className="addtag">Shared</span>
                  </span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
              </button>
              <button
                className="setrow"
                onClick={() => {
                  setAddMenu(false);
                  setPersonalEvent(true);
                  setPersonalOpen(true);
                }}
              >
                <span className="setrow-ic"><Icon name="calendar_today" size={24} /></span>
                <span className="setrow-txt">
                  <span className="t">
                    Anything else <span className="addtag">Private</span>
                  </span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* A going mark's class, opened as the sheet it opens as everywhere. */}
      {going && (
        <ClassPeekLoader
          base={going.base}
          classId={going.classId}
          iso={going.iso}
          onClose={() => setGoingOpen(null)}
          onChanged={() => router.refresh()}
        />
      )}

      {/* One of your own entries, and the same form again on that row. */}
      {plan && (
        <PlanSheet
          id={plan}
          onClose={() => setPlan(null)}
          onToast={toast}
          onRemoved={(msg) => {
            setPlan(null);
            toast(msg);
            router.refresh();
          }}
          onEdit={(p) => {
            setPlan(null);
            setPlanEdit({
              id: p.id,
              prefill: {
                name: p.name,
                classType: p.classType,
                description: p.description,
                image: p.image,
                startTime: p.startTime,
                durationMin: p.durationMin,
                studioId: p.studioId,
                location: p.location,
                withWho: p.withWho,
                links: p.links,
                days: [p.dayOfWeek],
                dayOfWeek: p.dayOfWeek,
                endsOn: p.endsOn,
                specificDate: p.specificDate,
              },
            });
          }}
        />
      )}
      {personalOpen && (
        <Adder
          studios={studios}
          templates={templates}
          customTypes={customTypes}
          lastUsed={lastUsed}
          subsCount={0}
          firstPublish={false}
          // The plus already asked which hat, so the form doesn't ask again.
          personal={{ canCoach: false, event: personalEvent }}
          onClose={() => setPersonalOpen(false)}
          onToast={toast}
          onPublished={(msg) => {
            setPersonalOpen(false);
            toast(msg);
            router.refresh();
          }}
          onDeleted={(msg) => {
            setPersonalOpen(false);
            toast(msg);
            router.refresh();
          }}
          onMatch={(m, again) => {
            setPersonalOpen(false);
            setMatch({ m, again });
          }}
        />
      )}
      {planEdit && (
        <Adder
          studios={studios}
          templates={templates}
          customTypes={customTypes}
          lastUsed={lastUsed}
          subsCount={0}
          firstPublish={false}
          personal={{ canCoach: false, editId: planEdit.id }}
          prefill={planEdit.prefill}
          onClose={() => setPlanEdit(null)}
          onToast={toast}
          onPublished={(msg) => {
            setPlanEdit(null);
            toast(msg);
            router.refresh();
          }}
          onDeleted={(msg) => {
            setPlanEdit(null);
            toast(msg);
            router.refresh();
          }}
        />
      )}
      {/* A public class already sits at that day and time: offer the real
          one, and keep the way back to "mine anyway". */}
      {match && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setMatch(null);
          }}
        >
          <div className="sheet confirmsheet">
            <h2>That class is on fittlist</h2>
            <p className="lead">
              {match.m.name} with {match.m.coachName} runs then. Add the real one and it stays up
              to date when the coach changes it.
            </p>
            <div className="publishwrap nostick">
              <button
                className="btn si"
                disabled={pBusy}
                onClick={() => {
                  if (!match || pBusy) return;
                  const { m } = match;
                  setPBusy(true);
                  startMerge(async () => {
                    const res = await setGoing(m.classId, m.iso, true);
                    setPBusy(false);
                    if (!res.ok) {
                      toast(res.error ?? "Couldn't add that");
                      return;
                    }
                    setMatch(null);
                    toast(`Added ${m.name} with ${m.coachName.trim().split(/\s+/)[0]}`);
                    router.refresh();
                  });
                }}
              >
                Add {match.m.name}
              </button>
              <button
                className="btn ghost"
                style={{ marginTop: 8 }}
                disabled={pBusy}
                onClick={() => {
                  const { again } = match;
                  setMatch(null);
                  again();
                }}
              >
                Add mine anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* The two floating doors: back to now, and every way of handing the
          calendar on. Neither over an empty calendar: Today lands on nothing
          and there is no week to hand on. */}
      {!bare && (
      <CalBottomBar
        raised={showFanView}
        onToday={() => {
          // In the Day view Today stays a day: it walks the strip home
          // rather than switching how you're looking.
          if (view === "day") {
            setDayIso(todayIso);
            setYm(todayIso.slice(0, 7));
            return;
          }
          pickView("list");
          requestAnimationFrame(() => requestAnimationFrame(scrollToToday));
        }}
        onAdd={() => (showFanView ? setAddMenu(true) : setAdder({ open: true }))}
      />
      )}


      {viewSheet && (
        <ViewSheet
          view={view}
          // Coming back to the List lands at today: the month scroll can be
          // months deep, and the list picking up wherever that left the
          // scroller was nowhere in particular.
          onPick={(v) => {
            pickView(v);
            if (v === "list") requestAnimationFrame(() => requestAnimationFrame(scrollToToday));
          }}
          onClose={() => setViewSheet(false)}
        />
      )}

      {filterSheet && (
        <KindFilterSheet
          present={(["coaching", "added", "private"] as CalKind[]).filter((k) =>
            presentKinds.has(k),
          )}
          // A coach wears all three hats, so all three can be offered.
          absent={(["coaching", "added", "private"] as CalKind[]).filter(
            (k) => !presentKinds.has(k),
          )}
          on={kindOn}
          onToggle={toggleKind}
          onAdd={(k) => {
            setFilterSheet(false);
            if (k === "coaching") {
              setAdder({ open: true });
              return;
            }
            setPersonalEvent(k === "private");
            setPersonalOpen(true);
          }}
          onClose={() => setFilterSheet(false)}
        />
      )}

      {showFanView && <NavBar active="calendar" scheduleHref="/calendar" />}

      {adder.open && (
        <Adder
          studios={studios}
          templates={templates}
          customTypes={customTypes}
          lastUsed={lastUsed}
          subsCount={subsCount}
          prefill={adder.prefill}
          firstPublish={!hasAnyClass}
          onClose={() => setAdder({ open: false })}
          onToast={toast}
          onPublished={(msg, _planId, published) => {
            setAdder({ open: false });
            toast(msg);
            if (published) setLive(published);
            router.refresh();
          }}
          onDeleted={(msg) => {
            setAdder({ open: false });
            toast(msg);
            router.refresh();
          }}
        />
      )}

      {/* The just-published class, offered for sharing: the link to a
          person, the card to a story. The toast above still says what
          happened; this says what to do with it. */}
      {live && (
        <ClassLiveSheet
          handle={handle}
          classId={live.id}
          name={live.name}
          onClose={() => setLive(null)}
          onToast={toast}
        />
      )}

      {/* The removal's receipt, with the way back: the same bar the Add
          answers with, holding Undo instead of See it. */}
      <div className={`favtoast listadded${removed ? " on" : ""}`} aria-hidden={!removed}>
        {removed && (
          <>
            <Icon name="add_circle" size={18} />
            <span className="favtoast-t">Removed {removed.name} from your schedule</span>
            <button className="favtoast-link" onClick={undoRemove}>
              Undo
            </button>
          </>
        )}
      </div>

      <Toast msg={toastMsg} on={toastOn} />
    </section>
  );
}

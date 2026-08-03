"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  CAL_PAST_DAYS,
  clockParts,
  fmtDayHeader,
  fmtDayHeaderRel,
  occurrenceEnded,
  runsOn,
  timeToMinutes,
} from "@/lib/format";
import type { ClassDto, LastUsed, StudioDto, TemplateDto } from "@/lib/types";
import type { WeekDay, WeekItem } from "@/lib/week";
import { Adder, type AdderPrefill } from "@/components/Adder";
import { AgendaAvatar } from "@/components/Agenda";
import { ClassLiveSheet } from "@/components/ClassLiveSheet";
import { ClassSheet } from "@/components/ClassSheet";
import { PlanSheet } from "@/components/PlanSheet";
import { mergeIntoGym } from "@/app/actions/gym";
import type { PersonalMatch } from "@/app/actions/personal";
import { setGoing } from "@/app/actions/going";
import { AppHeader } from "@/components/AppHeader";
import { NavBar } from "@/components/NavBar";
import { avatarColor } from "@/lib/avatar";
import {
  CalBottomBar,
  CalHead,
  CalSticky,
  KindChecks,
  MONTHS_AHEAD,
  MONTHS_BACK,
  MonthHeadRow,
  MonthScroll,
  ViewSheet,
  useListMonthSpy,
  loadCalView,
  monthLabel,
  saveCalView,
  scrollToToday,
  usePastReveal,
  type CalKind,
  type CalView,
  type MonthCellItem,
} from "@/components/CalendarBits";
import { ShareWeekSheet } from "@/components/ShareWeekSheet";
import { myWeekText } from "@/app/actions/weektext";
import { Icon } from "@/components/Icon";
import { InvitesBanner } from "@/components/InvitesBanner";
import { Toast, useToast } from "@/components/Toast";

// One week at a time: the button at the bottom asks for the next one.
const INITIAL_WEEKS = 1;
const MAX_WEEKS = 52;
// And backwards: scrolling up reveals what has been, to the loaded window.
const MAX_PAST_WEEKS = CAL_PAST_DAYS / 7;

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
  inboxUnread,
  notifUnread,
  plans,
  autoOpenAdder,
  handle,
  name,
  photo,
  invitesLeft,
  showFanView,
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
  inboxUnread: number;
  notifUnread: number;
  /** The classes they're going to and their own entries, from the same loader
   *  the member calendar uses: You is one calendar of everything now, and the
   *  rows wear Coaching, Going, Shift or Yours to say which hat. */
  plans: WeekDay[];
  autoOpenAdder: boolean;
  handle: string;
  /** For the You tab's face on the bottom bar, nothing else. */
  name: string;
  photo: string | null;
  invitesLeft: number;
  showFanView: boolean;
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
  // Which kinds are narrowed to. Empty means All: everything shows, which
  // is the default on arrival because a filter is a way of looking, not a
  // fact worth storing. The view is different: a preference, so it
  // survives arrival.
  const [pickedKinds, setPickedKinds] = useState<Set<CalKind>>(new Set());
  const kindOn = (k: CalKind) => pickedKinds.size === 0 || pickedKinds.has(k);
  const toggleKind = (k: CalKind) =>
    setPickedKinds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  const [view, setView] = useState<CalView>("list");
  useEffect(() => setView(loadCalView()), []);
  const [viewSheet, setViewSheet] = useState(false);
  // The month the grid is looking at; entering Month starts at today's.
  const [ym, setYm] = useState(todayIso.slice(0, 7));
  const pickView = (v: CalView) => {
    if (v === "month") setYm(todayIso.slice(0, 7));
    setView(v);
    saveCalView(v);
  };
  const [weeks, setWeeks] = useState(INITIAL_WEEKS);
  // Scrolling up reveals the past, a couple of weeks at a time.
  const { pastWeeks, sentinel } = usePastReveal(MAX_PAST_WEEKS);
  // The Share pill at the bottom: the menu of ways, then the story sheet.
  const [shareMenu, setShareMenu] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
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

  // One bell for everything: unread notifications + unread messages.
  const updatesUnread = notifUnread + inboxUnread;

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
  // still fills the screen before View more; the calendar horizon caps the
  // walk so an empty schedule doesn't scan a year.
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
    return ((h % 12) + (p.ap === "pm" ? 12 : 0)) * 60 + (m || 0);
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
  }, [classes, plans, todayIso, weeks, pickedKinds]);

  // The days already run, revealed by scrolling up: calendar days this time
  // (the past has a fixed shape), no ended-filter (been-and-gone is the
  // point), dimmed by the CSS the way the month grid dims them.
  const pastDays = useMemo(() => {
    if (!pastWeeks) return [] as CalDay[];
    const plansByIso = new Map(plans.map((d) => [d.iso, d.items]));
    const start = new Date(`${todayIso}T00:00:00Z`);
    const out: CalDay[] = [];
    for (let i = 1; i <= pastWeeks * 7; i++) {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const dow = (d.getUTCDay() + 6) % 7;
      const items = kindOn("coaching")
        ? classes
            .filter((c) => runsOn(c, iso, dow))
            .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
        : [];
      const extras = (plansByIso.get(iso) ?? []).filter((p) =>
        kindOn(p.personal ? "private" : "added"),
      );
      if (items.length || extras.length) {
        out.push({ iso, label: fmtDayHeader(iso), items, extras, past: true });
      }
    }
    return out.reverse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes, plans, todayIso, pastWeeks, pickedKinds]);

  // The title follows the List's scroll the same way it follows the
  // months': whichever day is under the header names the month.
  useListMonthSpy(view === "list", setYm, `${pastDays.length}|${days.length}`);

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
  }, [classes, plans, todayIso, pickedKinds]);

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

  return (
    <section className={`screen${showFanView ? " hasnav" : ""}`}>
      <div className="pad" style={{ paddingTop: 14, paddingBottom: showFanView ? 150 : 110 }}>
        <AppHeader
          unread={updatesUnread}
          search={showFanView}
          // The gear only where there is no You tab to hold the account: the
          // coaches-only mode has no tab bar, so the corner is the one door.
          settings={showFanView ? undefined : "/you"}
          home={showFanView ? "/feed" : "/app"}
          // Only where the bottom bar is: without the member side there are no
          // tabs to show, on any width.
          nav={showFanView ? { active: "schedule", scheduleHref: "/app" } : undefined}
        />

        {invitesLeft !== 0 && <InvitesBanner />}

        {/* The calendar's own header, pinned under the app's: the month with
            the view menu, Add across from them, and the kind checkmarks, with
            the divider underneath the lot. The list scrolls beneath it. */}
        <CalSticky>
          <CalHead
            label={monthLabel(ym, todayIso)}
            onMenu={() => setViewSheet(true)}
          >
            <button
              className="calhead-add"
              aria-label="Add"
              onClick={() => (showFanView ? setAddMenu(true) : setAdder({ open: true }))}
            >
              <Icon name="add" size={20} strokeWidth={2.6} />
            </button>
          </CalHead>
          {/* The kind filters: the All-led rail, each pill filling with the
              colour its rows wear. Only when there is more than one kind to
              tell apart. */}
          <KindChecks
            present={(["coaching", "added", "private"] as CalKind[]).filter((k) =>
              presentKinds.has(k),
            )}
            picked={pickedKinds}
            onToggle={toggleKind}
            onAll={() => setPickedKinds(new Set())}
          />
          {/* The weekday initials pin with the chrome while the months
              scroll beneath. */}
          {view === "month" && <MonthHeadRow />}
        </CalSticky>
        {view === "month" ? (
          <MonthScroll
            todayIso={todayIso}
            items={monthItems}
            onDay={openDay}
            onMonthInView={setYm}
          />
        ) : !hasAnyClass && plans.length === 0 ? (
          <div className="empty-block">
            <h2>Your week is empty</h2>
            <p>
              Add the classes you coach, every studio in one schedule. Your link starts working with
              the first one.
            </p>
            <button className="btn si" onClick={() => setAdder({ open: true })}>
              Add your first class
            </button>
          </div>
        ) : (
          <>
            {/* The way back in time: while this is on screen the list grows
                upward, so scrolling up walks into what has been. */}
            {sentinel}
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
                  <div className="ps-daycol">{d.label}</div>
                  <div className="ps-daycards">
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
                            onClick={() =>
                              p.personal
                                ? setPlan(p.id)
                                : setGoingOpen({ base: p.handle, classId: p.classId, iso: p.iso })
                            }
                          >
                            {/* The bar the kind colours; without it the grid's
                                first column swallowed the body. */}
                            <span className="ps-accent" aria-hidden="true" />
                            <span className="ps-ebody">
                              {/* Your own entry says so, the way a shift
                                  does: whose it is, above what it is. */}
                              {p.personal && (
                                <span className="ps-private ps-shifttop ps-tag-added">
                                  Added by you
                                </span>
                              )}
                              {!p.personal && p.coachName.trim() && (
                                <span className="ps-ecoach">
                                  <AgendaAvatar
                                    photo={p.coachPhoto}
                                    name={p.coachName}
                                    color={p.coachColor}
                                  />
                                  <span className="ps-ecoach-txt">{p.coachName}</span>
                                </span>
                              )}
                              <span className="ps-enm">{p.name}</span>
                              {p.where && <span className="ps-estudio">{p.where}</span>}
                            </span>
                            <span className="ps-etimecol">
                              <span className="ps-etime">
                                {p.hm}
                                <span className="ps-ap">{p.ap}</span>
                              </span>
                              <span className="ps-edur">{p.durationMin} min</span>
                            </span>
                          </button>
                          {/* The filled ribbon: this class is in your
                              schedule, and tapping it takes it out, with the
                              undo in the toast. A sibling, never a child. */}
                          {!p.personal && (
                            <button
                              className="evcard-add on"
                              aria-label={`Remove ${p.name} from your schedule`}
                              onClick={() => removeGoing(p)}
                            >
                              <Icon name="bookmark_added" size={20} />
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
                          <span className="ps-ebody">
                            {/* Shift rides its own line above the name, the
                                spot the coach chip takes on a Going row: it
                                says whose hat this is before what it is. */}
                            {c.shift && (
                              <span className="ps-private ps-shifttop ps-tag-shift">Shift</span>
                            )}
                            <span className="ps-enm">
                              {c.name}
                              {/* The name line keeps the facts about the class
                                  itself. */}
                              {!c.isPublic && <span className="ps-private">Private</span>}
                              {c.duplicateOf && <span className="ps-dupe">Duplicate</span>}
                            </span>
                            {where && <span className="ps-estudio">{where}</span>}
                          </span>
                          <span className="ps-etimecol">
                            <span className="ps-etime">
                              {start.hm}
                              <span className="ps-ap">{start.ap}</span>
                            </span>
                            <span className="ps-edur">{c.durationMin} min</span>
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
            {/* A week at a time, on request. The old behavior loaded four and
                kept loading on scroll, which made the schedule feel endless;
                asking is one tap and the list stays the size you asked for.
                Gone once the horizon runs dry: a short last page means there
                is nothing further to show. */}
            {weeks < MAX_WEEKS && days.length === weeks * 7 && (
              <button className="viewmore" onClick={() => setWeeks((w) => Math.min(w + 1, MAX_WEEKS))}>
                View more
              </button>
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
              <Icon name="close" size={16} />
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
        <ClassSheet
          handle={shiftOpen.base}
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
              <Icon name="close" size={16} />
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
                <span className="setrow-ic"><Icon name="campaign" size={22} /></span>
                <span className="setrow-txt">
                  <span className="t">A class you&rsquo;re coaching</span>
                  <span className="s">Goes on your schedule and your public page</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={20} /></span>
              </button>
              <button
                className="setrow"
                onClick={() => {
                  setAddMenu(false);
                  setPersonalEvent(false);
                  setPersonalOpen(true);
                }}
              >
                <span className="setrow-ic"><Icon name="bookmark" size={22} /></span>
                <span className="setrow-txt">
                  <span className="t">A class you&rsquo;re going to</span>
                  <span className="s">Yours alone; nothing public</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={20} /></span>
              </button>
              <button
                className="setrow"
                onClick={() => {
                  setAddMenu(false);
                  setPersonalEvent(true);
                  setPersonalOpen(true);
                }}
              >
                <span className="setrow-ic"><Icon name="calendar_today" size={22} /></span>
                <span className="setrow-txt">
                  <span className="t">Anything else</span>
                  <span className="s">An appointment, a session, time you&rsquo;re keeping</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={20} /></span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* A going mark's class, opened as the sheet it opens as everywhere. */}
      {going && (
        <ClassSheet
          handle={going.base}
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
          calendar on. */}
      <CalBottomBar
        raised={showFanView}
        onToday={() => {
          pickView("list");
          requestAnimationFrame(() => requestAnimationFrame(scrollToToday));
        }}
        onShare={() => setShareMenu(true)}
      />

      {shareMenu && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShareMenu(false);
          }}
        >
          <div className="sheet">
            <button
              className="iconbtn sheetclose"
              aria-label="Close"
              onClick={() => setShareMenu(false)}
            >
              <Icon name="close" size={16} />
            </button>
            <h2>Share your schedule</h2>
            <div className="settingslist ownermenu">
              <button
                className="setrow"
                onClick={() => {
                  setShareMenu(false);
                  setShareOpen(true);
                }}
              >
                <span className="setrow-ic"><Icon name="campaign" size={22} /></span>
                <span className="setrow-txt">
                  <span className="t">Share your week</span>
                  <span className="s">A story image with your link</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={20} /></span>
              </button>
              <button
                className="setrow"
                onClick={async () => {
                  setShareMenu(false);
                  const res = await myWeekText();
                  if (!res.ok || !res.text) {
                    toast(res.error ?? "Couldn't copy that");
                    return;
                  }
                  try {
                    await navigator.clipboard.writeText(res.text);
                    toast("Week copied, ready to paste");
                  } catch {
                    toast("Couldn't copy that");
                  }
                }}
              >
                <span className="setrow-ic"><Icon name="content_copy" size={22} /></span>
                <span className="setrow-txt">
                  <span className="t">Copy your week</span>
                  <span className="s">As text, ready to paste</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={20} /></span>
              </button>
              <button
                className="setrow"
                onClick={async () => {
                  setShareMenu(false);
                  try {
                    await navigator.clipboard.writeText(`${window.location.origin}/${handle}`);
                    toast("Link copied, ready to paste");
                  } catch {
                    toast("Couldn't copy that");
                  }
                }}
              >
                <span className="setrow-ic"><Icon name="link" size={22} /></span>
                <span className="setrow-txt">
                  <span className="t">Copy your link</span>
                  <span className="s">Straight to your page</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={20} /></span>
              </button>
            </div>
          </div>
        </div>
      )}

      <ShareWeekSheet
        handle={handle}
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        onToast={toast}
      />

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

      {showFanView && (
        <NavBar
          active="schedule"
          scheduleHref="/app"
          face={{
            photo,
            color: myAccent,
            initial: (name.trim().charAt(0) || "?").toUpperCase(),
          }}
        />
      )}

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
            <Icon name="bookmark" size={16} />
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

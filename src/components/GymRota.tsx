"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  applyStandardDay,
  closeGymDay,
  enableStudioSchedule,
  gymMonth,
  openGymDay,
  publishGymDrafts,
  setShiftCover,
  type GymCatalogItem,
  type GymClassDto,
  type GymCoachDto,
  type GymDayDto,
  type GymMonthDto,
  type GymWeekDto,
} from "@/app/actions/gym";
import { clockParts } from "@/lib/format";
import { Adder, type AdderPrefill } from "@/components/Adder";
import { Icon } from "@/components/Icon";
import { BackLink } from "@/components/BackLink";
import { Toast, useToast } from "@/components/Toast";
import { ClassLine } from "@/components/WeekView";
import { studioPlannerColorLabel } from "@/lib/studio-planner";
import { putImage } from "@/lib/shareimage";

/** "Thu, Aug 6" — the date a swap is about, said the way a person would. */
const fmtDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

const localTodayIso = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/** What the sheet is open on: a slot, or an empty day waiting for one. */
type Open = {
  iso: string;
  dayOfWeek: number;
  cls: GymClassDto | null;
  /** Month-grid plus buttons add to this exact date. */
  oneOff?: boolean;
};

type CoachPick = {
  iso: string;
  label: string;
  cls: GymClassDto;
};

type ShiftFilter = "all" | "assigned" | "mine" | "open";

const isShiftFilter = (value: string | null): value is ShiftFilter =>
  value === "all" || value === "assigned" || value === "mine" || value === "open";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const occurrenceKey = (classId: string, iso: string) => `${classId}:${iso}`;

function CoachPickerButton({
  className = "",
  name,
  disabled,
  label,
  onClick,
}: {
  className?: string;
  name?: string | null;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`rota-coach-picker${className ? ` ${className}` : ""}`}
      disabled={disabled}
      aria-label={label}
      onClick={onClick}
    >
      <span>{name || "Open"}</span>
      <Icon name="expand_more" size={16} />
    </button>
  );
}

/** Desktop staffing stays in the spreadsheet itself. A native selector lets
 * a manager move through a full month without opening and closing a sheet for
 * every class; mobile keeps the larger picker below for a dependable tap
 * target and a readable roster. */
function InlineCoachSelect({
  className = "",
  value,
  disabled,
  label,
  coaches,
  onChange,
}: {
  className?: string;
  value: string;
  disabled?: boolean;
  label: string;
  coaches: GymCoachDto[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      className={`rota-coach-select${className ? ` ${className}` : ""}`}
      value={value}
      disabled={disabled}
      aria-label={label}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">Open</option>
      {coaches.map((coach) => (
        <option key={coach.id} value={coach.id}>
          {coach.name}
        </option>
      ))}
    </select>
  );
}

// The rota: the thing the spreadsheet was for. A week of slots, each one a
// class and the person on it, and both are two taps to change. That is the one
// thing the spreadsheet was genuinely good at, so it is the thing to keep.
//
// Filling a class in is the coach's own adder, not a copy of it. A gym writes
// down the same things a coach does and had been asked for them twice in two
// slightly different forms, which is how the two drift. The gym-shaped parts
// are handed to it: the studio is fixed, private is not offered, and who is on
// the slot is a field only a rota has.
//
// Who is on a slot drives the shift, the notification and the calendar. It is
// not what the public sees: the gym's schedule goes out under the gym's name,
// and showing coaches is a separate switch with the coach's own say in it.
export function GymRota({
  studioId,
  studioName,
  studioAddress,
  studioSlug,
  manageBase,
  dashboardHref,
  hasAccount,
  week,
  coaches,
  catalog,
  customTypes,
  viewerId,
}: {
  studioId: string;
  studioName: string;
  studioAddress: string;
  studioSlug: string;
  /** /s/{slug}/manage, for the week links. */
  manageBase: string;
  dashboardHref: string;
  hasAccount: boolean;
  week: GymWeekDto | null;
  coaches: GymCoachDto[];
  /** Classes already described at this studio, to pull in rather than retype. */
  catalog: GymCatalogItem[];
  customTypes: string[];
  /** The manager viewing the planner, used only by the local My shifts filter. */
  viewerId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<Open | null>(null);
  const [closingDay, setClosingDay] = useState<{ iso: string; label: string } | null>(null);
  const [coachPick, setCoachPick] = useState<CoachPick | null>(null);
  const [monthMenu, setMonthMenu] = useState<string | null>(null);
  const [dayMenu, setDayMenu] = useState<string | null>(null);
  const [sharingOpenShifts, setSharingOpenShifts] = useState(false);
  const [shiftFilter, setShiftFilter] = useState<ShiftFilter>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [desktop, setDesktop] = useState(false);
  const [desktopView, setDesktopView] = useState<"week" | "month">("month");
  const [mobileView, setMobileView] = useState<"day" | "month">("day");
  const [month, setMonth] = useState<GymMonthDto | null>(null);
  const [monthLoading, setMonthLoading] = useState(false);
  const [selectedDayIso, setSelectedDayIso] = useState(() => {
    const initialDays = week?.days ?? [];
    const today = localTodayIso();
    return initialDays.some((day) => day.iso === today) ? today : initialDays[0]?.iso ?? "";
  });
  const monthRequest = useRef(0);
  const monthCache = useRef(new Map<string, GymMonthDto>());
  // A roster edit should read back immediately while the server updates the
  // occurrence and refreshes the rest of the calendar around it.
  const [coachOverrides, setCoachOverrides] = useState<Record<string, string>>({});
  const [coachSaving, setCoachSaving] = useState<Record<string, true>>({});
  // The one-date swap saves as you pick, so the rota keeps it rather than the
  // form: these echo the row while the sheet is up.
  const [onUserId, setOnUserId] = useState("");
  const [covered, setCovered] = useState(false);
  const [pending, start] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();
  const coachNameById = useMemo(
    () => new Map(coaches.map((coach) => [coach.id, coach.name] as const)),
    [coaches],
  );
  const days = week?.days ?? [];
  const sourceVisibleDays = desktop && desktopView === "month" && month
    ? month.days.filter((day) => day.iso.startsWith(month.month))
    : days;
  const effectiveCoach = useCallback(
    (cls: GymClassDto, iso: string) =>
      coachOverrides[occurrenceKey(cls.id, iso)] ?? cls.onUserId ?? "",
    [coachOverrides],
  );

  useEffect(() => {
    setSelectedDayIso((current) => {
      if (days.some((day) => day.iso === current)) return current;
      const today = localTodayIso();
      return days.some((day) => day.iso === today) ? today : days[0]?.iso ?? "";
    });
  }, [days]);
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("d");
    if (requested && days.some((day) => day.iso === requested)) setSelectedDayIso(requested);
  }, [days]);
  const matchesShiftFilter = useCallback(
    (cls: GymClassDto, iso: string) => {
      const coachId = effectiveCoach(cls, iso);
      if (shiftFilter === "mine") return coachId === viewerId;
      if (shiftFilter === "open") return !coachId;
      if (shiftFilter === "assigned") return !!coachId;
      return true;
    },
    [effectiveCoach, shiftFilter, viewerId],
  );
  const sourceAll = sourceVisibleDays.flatMap((d) => d.items);
  const visibleDrafts = new Set(sourceAll.filter((c) => !c.isPublic).map((c) => c.id)).size;

  const loadMonth = useCallback(async (key?: string, force = false) => {
    const request = ++monthRequest.current;
    if (key && !force) {
      const cached = monthCache.current.get(key);
      if (cached) {
        setMonth(cached);
        setMonthLoading(false);
        return;
      }
    }
    setMonthLoading(true);
    const data = await gymMonth(studioId, key);
    if (request !== monthRequest.current) return;
    if (data) monthCache.current.set(data.month, data);
    setMonth(data);
    setMonthLoading(false);
  }, [studioId]);

  useEffect(() => {
    const storageKey = `fittlist:studio-calendar-filter:${studioId}`;
    const restore = () => {
      const params = new URLSearchParams(window.location.search);
      const fromUrl = params.get("show");
      const remembered = window.localStorage.getItem(storageKey);
      setShiftFilter(
        isShiftFilter(fromUrl)
          ? fromUrl
          : isShiftFilter(remembered)
            ? remembered
            : "all",
      );
    };
    restore();
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, [studioId]);

  useEffect(() => {
    if (!hasAccount) return;
    const media = window.matchMedia("(min-width: 1100px)");
    const sync = () => {
      setDesktop(media.matches);
      if (media.matches) {
        const params = new URLSearchParams(window.location.search);
        const urlView = params.get("view");
        const remembered = window.localStorage.getItem("fittlist:studio-calendar-view");
        const chosen = urlView === "week" || urlView === "month"
          ? urlView
          : remembered === "week" ? "week" : "month";
        setDesktopView(chosen);
        if (chosen === "month" && !month) {
          void loadMonth(params.get("m") ?? undefined);
        }
      }
    };
    const restoreMonth = () => {
      if (!media.matches) return;
      const params = new URLSearchParams(window.location.search);
      const restoredView = params.get("view") === "week" ? "week" : "month";
      setDesktopView(restoredView);
      if (restoredView === "month") void loadMonth(params.get("m") ?? undefined);
    };
    sync();
    media.addEventListener("change", sync);
    window.addEventListener("popstate", restoreMonth);
    return () => {
      media.removeEventListener("change", sync);
      window.removeEventListener("popstate", restoreMonth);
    };
  }, [hasAccount, loadMonth, month]);

  const refreshView = () => {
    router.refresh();
    // A recurring edit can change every future month, not only the one on
    // screen. Drop the small client cache so returning to a visited month can
    // never resurrect its older color or class rows.
    monthCache.current.clear();
    if (desktop && desktopView === "month") void loadMonth(month?.month, true);
  };

  const chooseShiftFilter = (next: ShiftFilter) => {
    setShiftFilter(next);
    window.localStorage.setItem(`fittlist:studio-calendar-filter:${studioId}`, next);
    const url = new URL(window.location.href);
    if (next === "all") url.searchParams.delete("show");
    else url.searchParams.set("show", next);
    window.history.replaceState({}, "", url);
  };

  const show = (
    iso: string,
    dayOfWeek: number,
    cls: GymClassDto | null,
    oneOff = false,
  ) => {
    setDayMenu(null);
    setMonthMenu(null);
    const who = cls
      ? coachOverrides[occurrenceKey(cls.id, iso)] ?? cls.onUserId ?? ""
      : "";
    setOnUserId(who);
    setCovered(!!cls && who !== (cls.coachUserId ?? ""));
    setOpen({ iso, dayOfWeek, cls, oneOff });
  };

  const done = (msg: string) => {
    setOpen(null);
    toast(msg);
    refreshView();
  };

  // Who's on this one date. A swap is about a date, so it never touches the
  // standing rota; setting it back to the regular coach clears the exception.
  const cover = (who: string, allowCoachConflict = false) => {
    if (!open?.cls || (pending && !allowCoachConflict)) return;
    const cls = open.cls;
    start(async () => {
      const res = await setShiftCover(studioId, cls.id, open.iso, who || null, allowCoachConflict);
      if (!res.ok) {
        if (res.error?.startsWith("Schedule conflict:")) {
          const detail = res.error.replace(/^Schedule conflict:\s*/, "");
          if (window.confirm(`${detail}\n\nAssign this coach anyway?`)) cover(who, true);
          return;
        }
        toast(res.error ?? "Couldn't change that");
        return;
      }
      setOnUserId(who);
      setCovered(who !== (cls.coachUserId ?? ""));
      toast(who ? "Swapped" : "Open");
      refreshView();
    });
  };

  // The coach is the field a manager changes over and over. Keep it on the
  // occurrence itself: the rest of the card still opens the full class form,
  // while this picker writes the one-date assignment directly.
  const assignCoach = (cls: GymClassDto, iso: string, who: string, allowCoachConflict = false) => {
    const key = occurrenceKey(cls.id, iso);
    if (coachSaving[key] && !allowCoachConflict) return;
    const previous = coachOverrides[key] ?? cls.onUserId ?? "";
    setCoachOverrides((current) => ({ ...current, [key]: who }));
    setCoachSaving((current) => ({ ...current, [key]: true }));
    void (async () => {
      const res = await setShiftCover(studioId, cls.id, iso, who || null, allowCoachConflict);
      if (!res.ok) {
        setCoachOverrides((current) => ({ ...current, [key]: previous }));
        if (res.error?.startsWith("Schedule conflict:")) {
          const detail = res.error.replace(/^Schedule conflict:\s*/, "");
          if (window.confirm(`${detail}\n\nAssign this coach anyway?`)) assignCoach(cls, iso, who, true);
          return;
        }
        toast(res.error ?? "Couldn't change that");
      } else {
        const name = coachNameById.get(who);
        toast(name ? `${name} is on ${fmtDay(iso)}` : `${fmtDay(iso)} is open`);
        // The row already holds the confirmed assignment locally. Refresh the
        // server-owned week in the background without reloading all 42 month
        // days after every roster pick.
        router.refresh();
      }
      setCoachSaving((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    })();
  };

  const closeDay = () => {
    if (!closingDay || pending) return;
    const day = closingDay;
    start(async () => {
      const res = await closeGymDay(studioId, day.iso);
      if (!res.ok) {
        toast(res.error ?? "Couldn't close that day");
        return;
      }
      setClosingDay(null);
      toast(`${day.label} is closed`);
      refreshView();
    });
  };

  const openDay = (day: { iso: string; label: string }) => {
    if (pending) return;
    start(async () => {
      const res = await openGymDay(studioId, day.iso);
      if (!res.ok) {
        toast(res.error ?? "Couldn't open that day");
        return;
      }
      setMonthMenu(null);
      toast(`${day.label} is open`);
      refreshView();
    });
  };

  const shareDay = async (day: GymDayDto) => {
    setDayMenu(null);
    setMonthMenu(null);
    const lines = day.items.map((item) => {
      const clock = clockParts(item.startTime);
      const coachId = effectiveCoach(item, day.iso);
      const coachName = coachNameById.get(coachId)
        ?? (coachId === item.onUserId ? item.onName : "")
        ?? "";
      return `${clock.hm} ${clock.ap.toUpperCase()} · ${item.name} · ${coachName || "Open"}`;
    });
    const text = [
      studioName,
      fmtDay(day.iso),
      day.closed ? "Closed" : null,
      ...(lines.length ? lines : ["No classes"]),
    ].filter(Boolean).join("\n");
    try {
      if (navigator.share) {
        await navigator.share({ title: `${studioName} · ${fmtDay(day.iso)}`, text });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        toast("Day copied. Paste it into your group chat");
      } else {
        toast("Sharing isn't available here");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast("Couldn't share that day");
    }
  };

  const openShiftText = (openDays: GymDayDto[]) => {
    const lines = openDays.flatMap((day) => [
      fmtDay(day.iso),
      ...day.items.map((item) => {
        const clock = clockParts(item.startTime);
        return `${clock.hm} ${clock.ap.toUpperCase()} · ${item.name} · ${item.durationMin} min`;
      }),
      "",
    ]);
    return [studioName, "Open shifts", "", ...lines].join("\n").trim();
  };

  const copyOpenShifts = async (openDays: GymDayDto[]) => {
    try {
      await navigator.clipboard.writeText(openShiftText(openDays));
      toast("Open shifts copied");
    } catch {
      toast("Couldn't copy the open shifts");
    }
  };

  const shareOpenShiftImage = async () => {
    if (sharingOpenShifts) return;
    setSharingOpenShifts(true);
    const offset = week?.offset ?? 0;
    const ok = await putImage(
      `/api/story/open-shifts/${encodeURIComponent(studioId)}?w=${offset}&name=${encodeURIComponent(studioName)}&v=${Date.now()}`,
      `${studioSlug || "studio"}-open-shifts.png`,
    );
    setSharingOpenShifts(false);
    if (!ok) toast("Couldn't share the open shifts");
  };

  const useStandardDay = (day: GymDayDto) => {
    if (pending) return;
    setMonthMenu(null);
    start(async () => {
      const res = await applyStandardDay(studioId, day.iso);
      if (!res.ok) {
        toast(res.error ?? `Couldn't use standard ${WEEKDAYS[day.dayOfWeek]}`);
        return;
      }
      const parts = [
        `${res.added ?? 0} added`,
        res.duplicates ? `${res.duplicates} already there` : null,
        res.conflicts?.length ? `${res.conflicts.length} coach ${res.conflicts.length === 1 ? "conflict" : "conflicts"}` : null,
      ].filter(Boolean);
      toast(parts.join(" · "));
      refreshView();
    });
  };

  const publishDrafts = () => {
    if (pending) return;
    start(async () => {
      const res = await publishGymDrafts(studioId);
      if (!res.ok) {
        toast(res.error ?? "Couldn't publish drafts");
        return;
      }
      toast(res.count ? `${res.count} ${res.count === 1 ? "draft" : "drafts"} published` : "No drafts to publish");
      refreshView();
    });
  };

  if (!hasAccount) {
    return (
      <div className="pad">
        <div className="studio-manage-top pagetop">
          <div className="studio-manage-topbar">
            <BackLink
              className="evback studio-manage-back"
              href={dashboardHref}
              anywhere
              label="Back"
            >
              <Icon name="arrow_back" size={23} />
            </BackLink>
            <h1 className="studio-calendar-title">Calendar</h1>
            <span aria-hidden="true" />
          </div>
        </div>
        <div className="empty-block" style={{ marginTop: 24 }}>
          <h2>Run this studio&rsquo;s calendar here</h2>
          <p>
            Add classes, put coaches on them, and keep last-minute coverage in one place.
          </p>
          <button
            className="btn si"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await enableStudioSchedule(studioId);
                if (!res.ok) {
                  toast(res.error ?? "Couldn't start the schedule");
                  return;
                }
                toast("Your studio calendar is ready");
                router.refresh();
              })
            }
          >
            {pending ? "Starting…" : "Start managing the calendar"}
          </button>
        </div>
        <Toast msg={toastMsg} on={toastOn} />
      </div>
    );
  }

  const cls = open?.cls ?? null;
  // Editing points the form at the row that was tapped. Adding still carries
  // the day, so the sheet opens on the day the manager asked for.
  const prefill: AdderPrefill | undefined = open
    ? cls
      ? {
          classId: cls.id,
          name: cls.name,
          classType: cls.classType,
          description: cls.description,
          image: cls.image,
          startTime: cls.startTime,
          durationMin: cls.durationMin,
          studioId,
          isPublic: cls.isPublic,
          plannerColor: cls.plannerColor,
          links: cls.links.map((l) => ({ ...l })),
          days: cls.specificDate ? [] : [cls.dayOfWeek],
          dayOfWeek: cls.dayOfWeek,
          endsOn: cls.endsOn,
          specificDate: cls.specificDate,
          occurrenceDate: open.iso,
        }
      : {
          name: "",
          startTime: "06:00",
          durationMin: 60,
          studioId,
          isPublic: true,
          links: [],
          days: open.oneOff ? [] : [open.dayOfWeek],
          specificDate: open.oneOff ? open.iso : null,
        }
    : undefined;

  const moveMonth = (delta: number) => {
    const key = month?.month ?? new Date().toISOString().slice(0, 7);
    const [year, monthNumber] = key.split("-").map(Number);
    const next = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
    const nextKey = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
    const url = new URL(window.location.href);
    url.searchParams.set("view", "month");
    url.searchParams.set("m", nextKey);
    window.history.pushState({}, "", url);
    void loadMonth(nextKey);
  };
  const chooseDesktopView = (next: "week" | "month") => {
    setDesktopView(next);
    window.localStorage.setItem("fittlist:studio-calendar-view", next);
    const url = new URL(window.location.href);
    url.searchParams.set("view", next);
    if (next === "week") url.searchParams.delete("m");
    else if (month?.month) url.searchParams.set("m", month.month);
    window.history.replaceState({}, "", url);
    if (next === "month" && !month) void loadMonth();
  };
  const coachPickId = coachPick
    ? coachOverrides[occurrenceKey(coachPick.cls.id, coachPick.iso)] ?? coachPick.cls.onUserId ?? ""
    : "";
  const filteredWeekDays = days.map((day) => ({
    ...day,
    items: day.items.filter((item) => matchesShiftFilter(item, day.iso)),
  }));
  const openShiftDays = filteredWeekDays.filter((day) => day.items.length > 0);
  const openShiftCount = openShiftDays.reduce((count, day) => count + day.items.length, 0);
  const renderedWeekDays = shiftFilter === "open"
    ? openShiftDays
    : filteredWeekDays;
  const selectedDay = month?.days.find((day) => day.iso === selectedDayIso)
    ?? filteredWeekDays.find((day) => day.iso === selectedDayIso)
    ?? renderedWeekDays[0];
  const weekHref = (offset: number) => {
    const params = new URLSearchParams({ w: String(offset) });
    if (shiftFilter !== "all") params.set("show", shiftFilter);
    return `${manageBase}?${params.toString()}`;
  };
  const floatingAddDay = (() => {
    if (mobileView === "day" && selectedDay) return selectedDay;
    if (month) {
      const today = localTodayIso();
      return month.days.find((day) => day.iso === today)
        ?? month.days.find((day) => day.iso.startsWith(month.month));
    }
    return selectedDay ?? days[0];
  })();
  return (
    <div className={`pad gym-manage-pad${desktop ? " desktop" : ""}`}>
      <div className="studio-manage-top pagetop">
        <div className="studio-manage-topbar">
          <BackLink
            className="evback studio-manage-back"
            href={dashboardHref}
            anywhere
            label="Back"
          >
            <Icon name="arrow_back" size={23} />
          </BackLink>
          <h1 className="studio-calendar-title">{shiftFilter === "open" ? "Open shifts" : studioName}</h1>
          <button className="calendar-menu-button" aria-label="Calendar filters" onClick={() => setFilterOpen(true)}>
            <Icon name="tune" size={23} />
          </button>
        </div>
        {visibleDrafts > 0 && (
          <button className="rota-publish" disabled={pending} onClick={publishDrafts}>
            Publish {visibleDrafts} {visibleDrafts === 1 ? "draft" : "drafts"}
          </button>
        )}
      </div>

      {filterOpen && (
        <div className="calendar-drawer-scrim" onClick={(event) => event.target === event.currentTarget && setFilterOpen(false)}>
          <aside className="calendar-drawer" role="dialog" aria-modal="true" aria-labelledby="rota-filter-title">
            <div className="calendar-drawer-head"><h2 id="rota-filter-title">Calendar filters</h2><button className="iconbtn" aria-label="Close" onClick={() => setFilterOpen(false)}><Icon name="close" size={18} /></button></div>
            <section className="calendar-drawer-section"><h3>View</h3>
            <div>
              {([desktop ? "week" : "day", "month"] as const).map((view) => {
                const selected = desktop ? desktopView === view : mobileView === view;
                return <button className={`calendar-drawer-row calendar-view-choice${selected ? " on" : ""}`} key={view} onClick={() => {
                  if (desktop) chooseDesktopView(view === "day" ? "week" : view);
                  else setMobileView(view === "week" ? "day" : view);
                  if (view === "month" && !month) void loadMonth();
                }}><span className="calendar-view-choice-icon"><Icon name={view === "month" ? "calendar_view_month" : "calendar_view_day"} size={20} /></span>{view[0].toUpperCase() + view.slice(1)}</button>;
              })}
            </div></section>
            <section className="calendar-drawer-section"><h3>Schedule</h3><div>
              {([['all','All shifts'],['assigned','All coaches'],['open','Open shifts'],['mine','My shifts']] as [ShiftFilter,string][]).map(([value,label]) => (
                <button className={`calendar-drawer-row calendar-view-choice${shiftFilter === value ? " on" : ""}`} key={value} onClick={() => chooseShiftFilter(value)}><span className="calendar-view-choice-icon"><Icon name={value === "open" ? "event_available" : "groups"} size={20} /></span>{label}</button>
              ))}
            </div></section>
          </aside>
        </div>
      )}

      {(desktop ? desktopView === "month" : mobileView === "month") ? (
        <div className={`rota-month-view${desktop ? "" : " mobile"}`}>
          <div className="rota-month-toolbar">
            <div className="rota-month-nav">
              <button
                aria-label="Previous month"
                disabled={!month || month.month <= new Date().toISOString().slice(0, 7)}
                onClick={() => moveMonth(-1)}
              >
                <Icon name="chevron_left" size={22} />
              </button>
              <strong>{month?.label ?? "Calendar"}</strong>
              <button aria-label="Next month" onClick={() => moveMonth(1)}>
                <Icon name="chevron_right" size={22} />
              </button>
            </div>
          </div>

          {monthLoading && !month ? (
            <div className="rota-month-loading">Loading the month…</div>
          ) : month ? (
            <div className={`rota-month-board${monthLoading ? " loading" : ""}`}>
              <div className="rota-month-weekdays" aria-hidden="true">
                {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
              </div>
              <div className="rota-month-grid">
                {month.days.map((day) => {
                  const outside = !day.iso.startsWith(month.month);
                  const filteredItems = day.items.filter((item) => matchesShiftFilter(item, day.iso));
                  return (
                    <section
                      key={day.iso}
                      className={`rota-month-day${outside ? " outside" : ""}${day.closed ? " closed" : ""}${day.iso === localTodayIso() ? " today" : ""}`}
                      onClickCapture={!desktop && !outside ? (event) => {
                        // The compact month is navigation, not a second tiny
                        // editing surface. Any tap opens the readable day.
                        event.preventDefault();
                        event.stopPropagation();
                        setSelectedDayIso(day.iso);
                        setMobileView("day");
                      } : undefined}
                    >
                      <div className="rota-month-dayhead">
                        <span>
                          {Number(day.iso.slice(8, 10))}
                          {day.closed && <b className="rota-day-closed-label">Closed</b>}
                        </span>
                        {!outside && (
                          <div className="rota-month-daytools">
                            {!day.closed && (
                              <button
                                className="rota-month-dayadd"
                                aria-label={`Add a class on ${day.label}`}
                                onClick={() => show(day.iso, day.dayOfWeek, null, true)}
                              >
                                <Icon name="add" size={16} />
                              </button>
                            )}
                            <button
                              className="rota-month-more"
                              aria-label={`More options for ${day.label}`}
                              onClick={() => setMonthMenu(monthMenu === day.iso ? null : day.iso)}
                            >
                              <Icon name="more_horiz" size={18} />
                            </button>
                            {monthMenu === day.iso && (
                              <div className="rota-month-menu">
                                {month.standardDays.includes(day.dayOfWeek) && !day.closed && (
                                  <button onClick={() => useStandardDay(day)}>
                                    Use standard {WEEKDAYS[day.dayOfWeek]}
                                  </button>
                                )}
                                <button onClick={() => void shareDay(day)}>Share day</button>
                                {day.closed ? (
                                  <button onClick={() => openDay(day)}>Open day</button>
                                ) : (
                                  <button onClick={() => {
                                    setClosingDay({ iso: day.iso, label: day.label });
                                    setMonthMenu(null);
                                  }}>
                                    Close day
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="rota-month-events">
                        {filteredItems.map((c) => {
                          const key = occurrenceKey(c.id, day.iso);
                          const plannerColorLabel = studioPlannerColorLabel(c.plannerColor);
                          const selectedCoachId = coachOverrides[key] ?? c.onUserId ?? "";
                          const isCover = selectedCoachId !== (c.coachUserId ?? "");
                          const state = !c.isPublic
                            ? "draft"
                            : !selectedCoachId
                              ? "needs"
                              : isCover
                                ? "cover"
                                : "assigned";
                          return (
                            <div
                              key={key}
                              className={`rota-month-event ${state}`}
                              data-planner-color={c.plannerColor ?? undefined}
                              role={plannerColorLabel ? "group" : undefined}
                              aria-label={plannerColorLabel
                                ? `${c.name}, ${plannerColorLabel} calendar color`
                                : undefined}
                            >
                              <button
                                className="rota-month-eventmain"
                                disabled={day.closed}
                                onClick={() => show(day.iso, day.dayOfWeek, c)}
                                title={`Edit ${clockParts(c.startTime).hm} ${clockParts(c.startTime).ap} ${c.name}`}
                              >
                                <span className="rota-month-eventtop">
                                  <b>{clockParts(c.startTime).hm}<small>{clockParts(c.startTime).ap}</small></b>
                                  <strong>{c.name}</strong>
                                </span>
                                {!c.isPublic && <span className="rota-month-state">Draft</span>}
                              </button>
                              <InlineCoachSelect
                                className="rota-month-coachpick"
                                value={selectedCoachId}
                                disabled={day.closed || !!coachSaving[key]}
                                label={`Coach for ${c.name} on ${day.label}`}
                                coaches={coaches}
                                onChange={(who) => assignCoach(c, day.iso, who)}
                              />
                            </div>
                          );
                        })}
                        {!filteredItems.length && !outside && (
                          <span className="rota-month-empty">
                            {shiftFilter === "all" ? "No classes" : "No matching shifts"}
                          </span>
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="rota-month-loading">Couldn&rsquo;t load this month.</div>
          )}
        </div>
      ) : (
        <>
          {/* A real week, dates and all, because that's what the spreadsheet is
              and what a swap is about. */}
          {shiftFilter === "open" ? (
            <div className="rota-open-manager-head">
              <div>
                <strong>{openShiftCount} open {openShiftCount === 1 ? "shift" : "shifts"}</strong>
                <span>{week?.label ?? "This week"}</span>
              </div>
              <div className="rota-open-actions">
                <button type="button" onClick={() => void copyOpenShifts(openShiftDays)} disabled={!openShiftCount}>
                  <Icon name="content_copy" size={19} />
                  Copy text
                </button>
                <button className="primary" type="button" onClick={() => void shareOpenShiftImage()} disabled={!openShiftCount || sharingOpenShifts}>
                  <Icon name="ios_share" size={20} />
                  {sharingOpenShifts ? "Preparing…" : "Share image"}
                </button>
              </div>
            </div>
          ) : desktop ? <div className="rotaweek">
            <Link className={`rotanav${week && week.offset > 0 ? "" : " off"}`} href={weekHref(Math.max(0, (week?.offset ?? 0) - 1))} aria-disabled={!week || week.offset === 0}>
              <Icon name="chevron_left" size={20} />
            </Link>
            <span className="rotaweek-lbl">{week?.label ?? ""}</span>
            <Link className="rotanav" href={weekHref((week?.offset ?? 0) + 1)}>
              <Icon name="chevron_right" size={20} />
            </Link>
          </div> : null}

          <div className="calendar-cardlist rota-calendar">
            {shiftFilter === "open" && renderedWeekDays.length === 0 && (
              <div className="empty-block rota-open-empty">
                <h2>No open shifts</h2>
                <p>Every shift this week has a coach assigned.</p>
              </div>
            )}
            {renderedWeekDays.map((day) => (
              <section key={day.iso} className={`rotaday dayblock${day.closed ? " closed" : ""}`}>
                <div className="rotaday-h dayband">
                  <span className="dayband-d">
                    {fmtDay(day.iso)}
                    {day.closed && <b className="rota-day-closed-label">Closed</b>}
                  </span>
                  {desktop && <span className="rotaday-actions">
                    {!day.closed && (
                      <button
                        className="rota-day-add"
                        aria-label={`Add a class on ${fmtDay(day.iso)}`}
                        onClick={() => show(day.iso, day.dayOfWeek, null)}
                      >
                        <Icon name="add" size={20} />
                      </button>
                    )}
                    <span className="rota-day-menuwrap">
                      <button
                        className="rota-day-more"
                        aria-label={`More options for ${fmtDay(day.iso)}`}
                        aria-expanded={dayMenu === day.iso}
                        onClick={() => setDayMenu(dayMenu === day.iso ? null : day.iso)}
                      >
                        <Icon name="more_horiz" size={20} />
                      </button>
                      {dayMenu === day.iso && (
                        <span className="rota-day-menu">
                          <button onClick={() => void shareDay(day)}>Share day</button>
                          <button
                            disabled={pending}
                            onClick={() => {
                              setDayMenu(null);
                              if (day.closed) openDay(day);
                              else setClosingDay({ iso: day.iso, label: fmtDay(day.iso) });
                            }}
                          >
                            {day.closed ? "Open day" : "Close day"}
                          </button>
                        </span>
                      )}
                    </span>
                  </span>}
                </div>
                {day.items.length === 0 ? (
                  <p className="rotaempty">
                    {shiftFilter === "all" ? "Nothing on" : "No matching shifts"}
                  </p>
                ) : (
                  <div className="dayrows">
                    {day.items.map((c) => {
                      const key = occurrenceKey(c.id, day.iso);
                      const plannerColorLabel = studioPlannerColorLabel(c.plannerColor);
                      const selectedCoachId = coachOverrides[key] ?? c.onUserId ?? "";
                      const selectedCoachName = coachNameById.get(selectedCoachId)
                        ?? (selectedCoachId === c.onUserId ? c.onName : "");
                      return (
                        <div
                          className="clrow rota-inline-row"
                          data-planner-color={c.plannerColor ?? undefined}
                          role={plannerColorLabel ? "group" : undefined}
                          aria-label={plannerColorLabel
                            ? `${c.name}, ${plannerColorLabel} calendar color`
                            : undefined}
                          key={key}
                        >
                          <ClassLine
                            row={{
                              key,
                              name: c.name,
                              where: null,
                              hm: clockParts(c.startTime).hm,
                              ap: clockParts(c.startTime).ap,
                              dur: `${c.durationMin} min`,
                              tag: !c.isPublic
                                ? "Draft"
                                : undefined,
                              tagTone: !c.isPublic
                                ? "personal"
                                : undefined,
                              onTap: day.closed ? undefined : () => show(day.iso, day.dayOfWeek, c),
                            }}
                          />
                          {desktop ? (
                            <InlineCoachSelect
                              className="rota-inline-coachpick"
                              value={selectedCoachId}
                              disabled={day.closed || !!coachSaving[key]}
                              label={`Coach for ${c.name} on ${day.label}`}
                              coaches={coaches}
                              onChange={(who) => assignCoach(c, day.iso, who)}
                            />
                          ) : (
                            <CoachPickerButton
                              className="rota-inline-coachpick"
                              name={selectedCoachName}
                              disabled={day.closed || !!coachSaving[key]}
                              label={`Coach for ${c.name} on ${day.label}`}
                              onClick={() => setCoachPick({ cls: c, iso: day.iso, label: day.label })}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            ))}
          </div>
        </>
      )}

      {coachPick && (
        <div
          className="sheet-scrim"
          onClick={(event) => {
            if (event.target === event.currentTarget) setCoachPick(null);
          }}
        >
          <div className="sheet rota-coach-sheet" role="dialog" aria-modal="true" aria-labelledby="rota-coach-title">
            <div className="sheettitle">
              <div>
                <h2 id="rota-coach-title">Choose a coach</h2>
                <p>{coachPick.cls.name} · {coachPick.label}</p>
              </div>
              <button className="iconbtn sheetclose" aria-label="Close" onClick={() => setCoachPick(null)}>
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className="rota-coach-options" role="radiogroup" aria-label="Coach">
              <button
                type="button"
                role="radio"
                aria-checked={!coachPickId}
                className={coachPickId ? "" : "on"}
                onClick={() => {
                  assignCoach(coachPick.cls, coachPick.iso, "");
                  setCoachPick(null);
                }}
              >
                <span>
                  <strong>Open</strong>
                  <small>Leave this date open</small>
                </span>
                <span className="rota-coach-radio">
                  {!coachPickId && <Icon name="check" size={15} />}
                </span>
              </button>
              {coaches.map((coach) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={coachPickId === coach.id}
                  key={coach.id}
                  className={coachPickId === coach.id ? "on" : ""}
                  onClick={() => {
                    assignCoach(coachPick.cls, coachPick.iso, coach.id);
                    setCoachPick(null);
                  }}
                >
                  <span>
                    <strong>{coach.name}</strong>
                    {coach.id === coachPick.cls.coachUserId && <small>Usually coaches this class</small>}
                  </span>
                  <span className="rota-coach-radio">
                    {coachPickId === coach.id && <Icon name="check" size={15} />}
                  </span>
                </button>
              ))}
            </div>
            <p className="rota-coach-note">This changes only {coachPick.label}. Open the class to change every week.</p>
          </div>
        </div>
      )}

      {!desktop && shiftFilter !== "open" && floatingAddDay && (
        <div className="calendar-revealed-controls studio-calendar-controls" aria-label="Calendar controls">
          <div className="calendar-view-toggle" data-active={mobileView} role="group" aria-label="Calendar view">
            <button type="button" aria-label="Day view" aria-pressed={mobileView === "day"} onClick={() => setMobileView("day")}><Icon name="calendar_view_day" size={22} /></button>
            <button type="button" aria-label="Month view" aria-pressed={mobileView === "month"} onClick={() => { setMobileView("month"); if (!month) void loadMonth(); }}><Icon name="calendar_month" size={22} /></button>
          </div>
          <button
            className="calendar-add-pill"
            aria-label={`Add a class on ${fmtDay(floatingAddDay.iso)}`}
            onClick={() => show(floatingAddDay.iso, floatingAddDay.dayOfWeek, null, true)}
          >
            <Icon name="add" size={27} />
          </button>
        </div>
      )}

      {closingDay && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setClosingDay(null);
          }}
        >
          <div className="sheet confirmsheet">
            <h2>Close {closingDay.label}?</h2>
            <p className="lead">
              The classes will stay on your calendar but will be unavailable that day. People who saved one and coaches who are on one will be told.
            </p>
            <div className="publishwrap nostick">
              <button className="btn si" disabled={pending} onClick={closeDay}>
                {pending ? "Closing…" : "Close this day"}
              </button>
              <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => setClosingDay(null)}>
                Keep the day open
              </button>
            </div>
          </div>
        </div>
      )}

      {open && (
        <Adder
          studios={[{ id: studioId, seq: 0, name: studioName, address: studioAddress }]}
          templates={[]}
          customTypes={customTypes}
          lastUsed={{ startTime: "06:00", durationMin: 60, studioId }}
          subsCount={0}
          prefill={prefill}
          firstPublish={false}
          gym={{
            studioId,
            coaches: coaches.map((c) => ({ id: c.id, name: c.name })),
            catalog,
            coachUserId: cls?.coachUserId ?? "",
            dateSwap: cls ? (
              <>
                <label className="flabel" htmlFor="rotaOn">
                  Who&rsquo;s on {fmtDay(open.iso)}
                </label>
                <select
                  id="rotaOn"
                  className="typeselect"
                  value={onUserId}
                  disabled={pending}
                  onChange={(e) => cover(e.target.value)}
                >
                  <option value="">Open</option>
                  {coaches.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.id === cls.coachUserId ? " (usually)" : ""}
                    </option>
                  ))}
                </select>
                <p className="durnote" style={{ marginTop: 8, marginBottom: 18 }}>
                  {covered
                    ? "Just this one. The weekly slot is unchanged, and both of them have been told."
                    : "Changing this only changes this date. Whoever it moves to and from hears about it."}
                </p>
              </>
            ) : null,
          }}
          onClose={() => setOpen(null)}
          onToast={toast}
          onPublished={done}
          onDeleted={done}
        />
      )}
      <Toast msg={toastMsg} on={toastOn} />
    </div>
  );
}

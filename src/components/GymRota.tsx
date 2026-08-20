"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  closeGymDay,
  copyGymDay,
  enableStudioSchedule,
  gymMonth,
  publishGymDrafts,
  setShiftCover,
  type GymCatalogItem,
  type GymClassDto,
  type GymCoachDto,
  type GymMonthDto,
  type GymWeekDto,
} from "@/app/actions/gym";
import { clockParts } from "@/lib/format";
import { Adder, type AdderPrefill } from "@/components/Adder";
import { BackLink } from "@/components/BackLink";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";
import { ClassLine } from "@/components/WeekView";

/** "Thu, Aug 6" — the date a swap is about, said the way a person would. */
const fmtDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

/** What the sheet is open on: a slot, or an empty day waiting for one. */
type Open = {
  iso: string;
  dayOfWeek: number;
  cls: GymClassDto | null;
  /** Month-grid plus buttons add to this exact date. */
  oneOff?: boolean;
};

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

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
  backHref,
  manageBase,
  hasAccount,
  week,
  coaches,
  catalog,
  customTypes,
}: {
  studioId: string;
  studioName: string;
  studioAddress: string;
  backHref: string;
  /** /s/{slug}/manage, for the week links. */
  manageBase: string;
  hasAccount: boolean;
  week: GymWeekDto | null;
  coaches: GymCoachDto[];
  /** Classes already described at this studio, to pull in rather than retype. */
  catalog: GymCatalogItem[];
  customTypes: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState<Open | null>(null);
  const [closingDay, setClosingDay] = useState<{ iso: string; label: string } | null>(null);
  const [copyingDay, setCopyingDay] = useState<{ day: number; label: string } | null>(null);
  const [monthMenu, setMonthMenu] = useState<string | null>(null);
  const [desktop, setDesktop] = useState(false);
  const [month, setMonth] = useState<GymMonthDto | null>(null);
  const [monthLoading, setMonthLoading] = useState(false);
  const monthRequest = useRef(0);
  const monthCache = useRef(new Map<string, GymMonthDto>());
  // The one-date swap saves as you pick, so the rota keeps it rather than the
  // form: these echo the row while the sheet is up.
  const [onUserId, setOnUserId] = useState("");
  const [covered, setCovered] = useState(false);
  const [pending, start] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();
  const days = week?.days ?? [];
  const visibleDays = desktop && month
    ? month.days.filter((day) => day.iso.startsWith(month.month))
    : days;
  const all = visibleDays.flatMap((d) => d.items);
  const openSlots = all.filter((c) => !c.onUserId).length;
  const visibleDrafts = new Set(all.filter((c) => !c.isPublic).map((c) => c.id)).size;

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
    if (!hasAccount) return;
    const media = window.matchMedia("(min-width: 1100px)");
    const sync = () => {
      setDesktop(media.matches);
      if (media.matches && !month) {
        const key = new URLSearchParams(window.location.search).get("m") ?? undefined;
        void loadMonth(key);
      }
    };
    const restoreMonth = () => {
      if (!media.matches) return;
      const key = new URLSearchParams(window.location.search).get("m") ?? undefined;
      void loadMonth(key);
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
    if (desktop) void loadMonth(month?.month, true);
  };

  const show = (
    iso: string,
    dayOfWeek: number,
    cls: GymClassDto | null,
    oneOff = false,
  ) => {
    setOnUserId(cls?.onUserId ?? "");
    setCovered(cls?.covered ?? false);
    setOpen({ iso, dayOfWeek, cls, oneOff });
  };

  const done = (msg: string) => {
    setOpen(null);
    toast(msg);
    refreshView();
  };

  // Who's on this one date. A swap is about a date, so it never touches the
  // standing rota; setting it back to the regular coach clears the exception.
  const cover = (who: string) => {
    if (!open?.cls || pending) return;
    const cls = open.cls;
    start(async () => {
      const res = await setShiftCover(studioId, cls.id, open.iso, who || null);
      if (!res.ok) {
        toast(res.error ?? "Couldn't change that");
        return;
      }
      setOnUserId(who);
      setCovered(who !== (cls.coachUserId ?? ""));
      toast(who ? "Swapped" : "Opened up");
      refreshView();
    });
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
      toast(res.count ? `${res.count} ${res.count === 1 ? "class" : "classes"} cancelled` : "Nothing was scheduled");
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

  const copyDay = (targetDay: number) => {
    if (!copyingDay || pending) return;
    const source = copyingDay;
    start(async () => {
      const res = await copyGymDay(studioId, source.day, targetDay);
      if (!res.ok) {
        toast(res.error ?? "Couldn't copy that day");
        return;
      }
      setCopyingDay(null);
      toast(`${res.count} ${res.count === 1 ? "class" : "classes"} copied`);
      refreshView();
    });
  };

  if (!hasAccount) {
    return (
      <div className="pad">
        <div className="admintop pagetop">
          <div>
            <h1>{studioName}</h1>
            <p className="adminsub">The schedule</p>
          </div>
          <BackLink className="iconbtn acctclose" href={backHref} label="Back to the studio's shifts">
            <Icon name="close" size={20} />
          </BackLink>
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
  const monthAddDay = month?.days.find((day) => day.iso === new Date().toISOString().slice(0, 10))
    ?? month?.days.find((day) => day.iso.startsWith(month.month));

  return (
    <div className={`pad gym-manage-pad${desktop ? " desktop" : ""}`}>
      <div className="admintop pagetop">
        <div>
          <h1>{studioName}</h1>
          <p className="adminsub">
            {all.length === 0
              ? desktop ? "The month is empty" : "The week is empty"
              : `${all.length} ${all.length === 1 ? "class" : "classes"}` +
                (openSlots ? ` · ${openSlots} with nobody on` : "")}
          </p>
          {visibleDrafts > 0 && (
            <button className="rota-publish" disabled={pending} onClick={publishDrafts}>
              Publish {visibleDrafts} {visibleDrafts === 1 ? "draft" : "drafts"}
            </button>
          )}
        </div>
        <BackLink className="iconbtn acctclose" href={backHref} label="Back to the studio's shifts">
          <Icon name="close" size={20} />
        </BackLink>
      </div>

      {desktop ? (
        <div className="rota-month-view">
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
            {monthAddDay && (
              <button
                className="rota-month-add"
                onClick={() => show(monthAddDay.iso, monthAddDay.dayOfWeek, null, true)}
              >
                <Icon name="add" size={20} /> Add a class
              </button>
            )}
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
                  return (
                    <section
                      key={day.iso}
                      className={`rota-month-day${outside ? " outside" : ""}`}
                    >
                      <div className="rota-month-dayhead">
                        <span>{Number(day.iso.slice(8, 10))}</span>
                        {!outside && (
                          <div className="rota-month-daytools">
                            <button
                              className="rota-month-dayadd"
                              aria-label={`Add a class on ${day.label}`}
                              onClick={() => show(day.iso, day.dayOfWeek, null, true)}
                            >
                              <Icon name="add" size={16} />
                            </button>
                            <button
                              className="rota-month-more"
                              aria-label={`More options for ${day.label}`}
                              onClick={() => setMonthMenu(monthMenu === day.iso ? null : day.iso)}
                            >
                              <Icon name="more_horiz" size={18} />
                            </button>
                            {monthMenu === day.iso && (
                              <div className="rota-month-menu">
                                <button onClick={() => {
                                  setClosingDay({ iso: day.iso, label: day.label });
                                  setMonthMenu(null);
                                }}>
                                  Close day
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="rota-month-events">
                        {day.items.map((c) => {
                          const state = !c.isPublic
                            ? "draft"
                            : !c.onUserId
                              ? "needs"
                              : c.covered
                                ? "cover"
                                : "assigned";
                          return (
                            <button
                              key={`${c.id}:${day.iso}`}
                              className={`rota-month-event ${state}`}
                              onClick={() => show(day.iso, day.dayOfWeek, c)}
                              title={`${clockParts(c.startTime).hm} ${clockParts(c.startTime).ap} ${c.name}`}
                            >
                              <span className="rota-month-eventtop">
                                <b>{clockParts(c.startTime).hm}<small>{clockParts(c.startTime).ap}</small></b>
                                <strong>{c.name}</strong>
                              </span>
                              <span className="rota-month-coach">
                                {!c.isPublic ? "Draft · " : c.covered ? "Cover · " : ""}
                                {c.onName || "Needs coach"}
                              </span>
                            </button>
                          );
                        })}
                        {!day.items.length && !outside && <span className="rota-month-empty">No classes</span>}
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
          <div className="rotaweek">
            <Link
              className={`rotanav${week && week.offset > 0 ? "" : " off"}`}
              href={`${manageBase}?w=${Math.max(0, (week?.offset ?? 0) - 1)}`}
              aria-disabled={!week || week.offset === 0}
            >
              <Icon name="chevron_left" size={20} />
            </Link>
            <span className="rotaweek-lbl">{week?.label ?? ""}</span>
            <Link className="rotanav" href={`${manageBase}?w=${(week?.offset ?? 0) + 1}`}>
              <Icon name="chevron_right" size={20} />
            </Link>
          </div>

          <div className="calendar-cardlist rota-calendar">
            {days.map((day) => (
              <section key={day.iso} className="rotaday dayblock">
                <div className="rotaday-h dayband">
                  <span className="dayband-d">{day.label}</span>
                  <span className="rotaday-actions">
                    <button className="rotaadd" onClick={() => show(day.iso, day.dayOfWeek, null)}>
                      <Icon name="add" size={18} /> Add
                    </button>
                    <button className="rotaadd" onClick={() => setCopyingDay({ day: day.dayOfWeek, label: day.label })}>
                      Copy day
                    </button>
                    <button className="rotaadd" onClick={() => setClosingDay({ iso: day.iso, label: day.label })}>
                      Close day
                    </button>
                  </span>
                </div>
                {day.items.length === 0 ? (
                  <p className="rotaempty">Nothing on</p>
                ) : (
                  <div className="dayrows">
                    {day.items.map((c) => (
                      <ClassLine
                        key={`${c.id}:${day.iso}`}
                        row={{
                          key: `${c.id}:${day.iso}`,
                          name: c.name,
                          where: c.onName || "Nobody on it yet",
                          hm: clockParts(c.startTime).hm,
                          ap: clockParts(c.startTime).ap,
                          dur: `${c.durationMin} min`,
                          tag: !c.isPublic
                            ? "Draft"
                            : !c.onUserId
                              ? "Needs coach"
                              : c.covered
                                ? "Cover"
                                : undefined,
                          tagTone: !c.isPublic
                            ? "personal"
                            : !c.onUserId
                              ? "attention"
                              : c.covered
                                ? "coaching"
                                : undefined,
                          onTap: () => show(day.iso, day.dayOfWeek, c),
                        }}
                      />
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        </>
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
              Every class that day will be cancelled. People who saved one and coaches who are on one will be told.
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

      {copyingDay && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setCopyingDay(null);
          }}
        >
          <div className="sheet confirmsheet">
            <h2>Copy {copyingDay.label}</h2>
            <p className="lead">
              Add its regular classes to another day. Classes already there stay as they are.
            </p>
            <div className="copyday-grid">
              {days.map((day, target) => (
                <button
                  key={day.iso}
                  className="btn ghost"
                  disabled={pending || target === copyingDay.day}
                  onClick={() => copyDay(target)}
                >
                  {day.label}
                </button>
              ))}
            </div>
            <button className="btn ghost copyday-cancel" onClick={() => setCopyingDay(null)}>
              Cancel
            </button>
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
                  <option value="">Nobody yet</option>
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

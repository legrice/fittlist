"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { setGoing } from "@/app/actions/going";
import {
  removePersonalClass,
  type PersonalDetail,
  type PersonalMatch,
} from "@/app/actions/personal";
import { AddBrowse } from "@/components/AddBrowse";
import { Adder, type AdderPrefill } from "@/components/Adder";
import { ClassLine, DayBand, type WeekRow } from "@/components/WeekView";
import { HighlightOnLand } from "@/components/HighlightOnLand";
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
import { fmtDayHeaderRel } from "@/lib/format";
import { CircleTray } from "@/components/CircleTray";
import { ClassOpener } from "@/components/ClassOpener";
import { InviteSheet } from "@/components/InviteFriends";
import { PlanSheet } from "@/components/PlanSheet";
import type { Circle } from "@/lib/circles";
import type { LastUsed, StudioDto, TemplateDto } from "@/lib/types";
import type { WeekDay } from "@/lib/week";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";

const WEEK_SHARE_KEY = "fl-week-share";

// A member's You tab: their calendar. The classes they added, their own
// entries, the tools across the top, and the plus to put more on it.
//
// Still no month grid, no empty days, no time gutter: it holds only what they
// picked, in time order, and it empties itself as the week passes. What
// changed is its place in the app: it is the same screen a coach's /app is,
// with the hats this viewer actually wears.
export function WeekScreen({
  days,
  circles,
  todayIso,
  studios,
  templates,
  customTypes,
  lastUsed,
  autoOpenAdder = false,
}: {
  days: WeekDay[];
  /** Everyone they follow, as faces. Following no longer pours anybody's
   *  classes onto this calendar; it puts a circle up there, and saving from
   *  behind one is what fills the week. */
  circles: Circle[];
  /** The app's today, from the app's clock, for the month header and grid. */
  todayIso: string;
  /** The adder's ingredients. Adding a class you go to is the same form as
   *  adding one you teach, so it needs the same directory and the same memory
   *  of what you filled in last time. A coach never lands here (their
   *  calendar is /app), so the form below never needs the chair question. */
  studios: StudioDto[];
  templates: TemplateDto[];
  customTypes: string[];
  lastUsed: LastUsed;
  /** Arrive with the adder already up. The composer's empty state sends a
   *  member here, and landing on the calendar they already know is empty,
   *  with the button they were promised nowhere in sight, is the offer being
   *  withdrawn on arrival. */
  autoOpenAdder?: boolean;
}) {
  const router = useRouter();
  const [gone, setGone] = useState<Record<string, boolean>>({});
  // Removing is one tap next to a list of things you meant to do, so it asks.
  const [confirm, setConfirm] = useState<{ classId: string; iso: string; key: string; name: string; personalId?: string } | null>(null);
  // A class you go to. It used to be five fields in a sheet of its own, which
  // meant the thing you booked through ClassPass arrived with no studio, no
  // description and no picture. It is the coach's own form now.
  const [addOpen, setAddOpen] = useState(false);
  // The plus asks which kind first: a class, or anything else. A member has
  // two answers now, so they get the same sheet a coach does, minus the hat.
  const [addMenu, setAddMenu] = useState(false);
  const [personalEvent, setPersonalEvent] = useState(false);
  // One of your own, opened: it had no page behind it and so no way in at all.
  const [plan, setPlan] = useState<string | null>(null);
  // The same form again, this time on a row that already exists.
  const [edit, setEdit] = useState<{ id: string; prefill: AdderPrefill } | null>(null);
  // Just added one. A row in a list doesn't say that a picture of it exists,
  // and the picture is the only thing one of your own can hand on, so the note
  // offers it once rather than a toast that reports the save and leaves.
  const [justAdded, setJustAdded] = useState<string | null>(null);
  // The same sheet, opened straight onto its card.
  const [shareId, setShareId] = useState<string | null>(null);
  // A public class already sits at that day and time; offer the real one, and
  // keep the way back to "mine anyway" so the answer costs them nothing.
  const [match, setMatch] = useState<{ m: PersonalMatch; again: () => void } | null>(null);
  const [pBusy, setPBusy] = useState(false);
  // "Is Jenny on fittlist?" — the invite sheet, opened from a personal row.
  const [inviteOpen, setInviteOpen] = useState(false);
  const [, start] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();
  // Which kinds are switched off, in the sheet behind the header's filter
  // glyph: the same sheet the coach's /app wears, minus Teaching, which a
  // member hasn't got. Everything on by default; off resets on arrival.
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
  // The composer's empty state sends them here to fill the week in, so the
  // form is already up when they land. The URL is tidied behind them, or a
  // reload reopens a sheet they closed on purpose.
  useEffect(() => {
    if (autoOpenAdder) {
      setAddOpen(true);
      window.history.replaceState(null, "", "/week");
    }
  }, [autoOpenAdder]);
  const [view, setView] = useState<CalView>("list");
  useEffect(() => setView(loadCalView()), []);
  const [viewSheet, setViewSheet] = useState(false);
  const [ym, setYm] = useState(todayIso.slice(0, 7));
  // Arriving here from an add, which is the moment the week became worth
  // showing somebody. A coach's publish ends on the share moment for exactly
  // this reason; a member's add ended on nothing, and the poster sat behind a
  // small pill between two controls that only change how you look.
  //
  // It is offered one tap later rather than in the note the add itself puts
  // up: that note is transient and already carries two things, and it pops on
  // somebody else's profile, where "share your week" is a jump. Here the
  // picture is about what is on the screen.
  const [weekShare, setWeekShare] = useState(false);
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).get("hl")) return;
    // Once it has been closed it stays closed. Per device, like the follow
    // hint's; a column is the fix if that starts to matter.
    try {
      if (localStorage.getItem(WEEK_SHARE_KEY) === "off") return;
    } catch {
      /* private mode */
    }
    setWeekShare(true);
  }, []);
  const closeWeekShare = (forever: boolean) => {
    setWeekShare(false);
    if (!forever) return;
    try {
      localStorage.setItem(WEEK_SHARE_KEY, "off");
    } catch {
      /* private mode */
    }
  };
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
  const openDay = (iso: string) => {
    pickView("list");
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        document.getElementById(`day-${iso}`)?.scrollIntoView({ block: "start", behavior: "smooth" }),
      ),
    );
  };
  // The mini calendar behind the month's chevron. A date picked jumps the
  // open view; a past date from the List opens Day instead, because Day is
  // the one view that can show any date and the List only grows into the
  // past as the scroll asks for it.
  const [pickerOpen, setPickerOpen] = useState(false);
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

  const remove = (classId: string, iso: string, key: string, personalId?: string) => {
    setConfirm(null);
    setGone((g) => ({ ...g, [key]: true }));
    start(async () => {
      const res = personalId
        ? await removePersonalClass(personalId)
        : await setGoing(classId, iso, false);
      if (!res.ok) {
        setGone((g) => ({ ...g, [key]: false }));
        toast(res.error ?? "Couldn't remove that");
        return;
      }
      // One of your own is off your calendar; a Going mark is off a list you
      // can add back to. Same X, two different things gone.
      toast(personalId ? "Removed from your calendar" : "Removed from your plans");
      router.refresh();
    });
  };

  // Nothing on the calendar at all: not "nothing this week", and not
  // "everything is filtered out", but no row anywhere in the window the
  // loader handed over, minus whatever was just removed. It reads the raw
  // days rather than the filtered ones on purpose, because a kind switched
  // off is a way of looking and this is a question about what exists.
  const bare = days.every((d) =>
    d.items.every((i) => gone[`${i.personal ? i.id : i.classId}|${i.iso}`]),
  );

  // A filter is only offered where it can narrow something: both kinds have
  // to be on the calendar before the row appears at all.
  const presentKinds = new Set<CalKind>(
    days.flatMap((d) => d.items.map((i) => (i.personal ? "private" : "added"))),
  );
  // Every day the loader handed over (past window included), minus what was
  // removed and what the checkmarks hide.
  const allShown = days
    .map((d) => ({
      ...d,
      items: d.items
        .filter((i) => !gone[`${i.personal ? i.id : i.classId}|${i.iso}`])
        .filter((i) => kindOn(i.personal ? "private" : "added")),
    }))
    .filter((d) => d.items.length > 0);
  // The List starts at today and stops there; see the same note on the coach's
  // ScheduleScreen. It grew upward as the scroll asked for it until the tray
  // arrived above it, and a list that grows over the faces puts them a mile up
  // a scroll nobody wants to make. The Month grid and Day view still reach the
  // past, and reach it without scrolling at all.
  const shown = allShown.filter((d) => d.iso >= todayIso);
  const pastShown: typeof allShown = [];
  // The title follows the List's scroll the same way it follows the
  // months': whichever day is under the header names the month.
  useListMonthSpy(view === "list", setYm, `${pastShown.length}|${shown.length}`);
  // The months, whole, from the same rows: past days dim rather than drop.
  // Every day the data holds goes in; each month block reads its own.
  const monthItems = (() => {
    const map = new Map<string, MonthCellItem[]>();
    for (const d of allShown) {
      const rows = d.items.map((i) => {
        const [h, m] = i.hm.split(":").map(Number);
        return {
          kind: (i.personal ? "private" : "added") as CalKind,
          name: i.name,
          at: ((h % 12) + (i.ap.toLowerCase() === "pm" ? 12 : 0)) * 60 + (m || 0),
        };
      });
      rows.sort((a, b) => a.at - b.at);
      if (rows.length) map.set(d.iso, rows);
    }
    return map;
  })();
  // The first named person on a personal entry, for the invite line.
  const namedCoach = days
    .flatMap((d) => d.items)
    .find((i) => i.personal && i.coachName.trim())?.coachName.trim();

  const addTheRealOne = () => {
    if (!match || pBusy) return;
    const { m } = match;
    setPBusy(true);
    start(async () => {
      const res = await setGoing(m.classId, m.iso, true);
      setPBusy(false);
      if (!res.ok) {
        toast(res.error ?? "Couldn't add that");
        return;
      }
      setMatch(null);
      setAddOpen(false);
      toast(`Added ${m.name} with ${m.coachName.trim().split(/\s+/)[0]}`);
      router.refresh();
    });
  };
  const left = shown.reduce((n, d) => n + d.items.length, 0);
  // One key per row, shared by the agenda item and the entry it came from: the
  // shared row only carries what every list needs, and removing one still wants
  // the whole thing.
  type Entry = WeekDay["items"][number];
  const rowKey = (i: Entry) => `${i.personal ? i.id : i.classId}|${i.iso}`;
  const byKey: Record<string, Entry> = Object.fromEntries(
    allShown.flatMap((d) => d.items.map((i) => [rowKey(i), i] as const)),
  );

  return (
    // The tabs layout is the shell now: header above, bar below, and its .pad
    // already leaves room for the bar. The extra room here is for the floating
    // Share pill, which sits above it.
    <>
      <HighlightOnLand />
      <div className="weekwrap">
        {/* The faces, above everything and scrolling away with the page. It is
            deliberately outside the `bare` gate that strips the rest of the
            chrome: an empty calendar with circles on it is the exact state
            where the tray is the thing to tap, and hiding it there would leave
            somebody who follows five coaches looking at a screen that says
            they have nothing. */}
        <CircleTray circles={circles} />
        {/* The calendar's own header, pinned under the app's: the month with
            the view menu, Add across from them, and the kind checkmarks, with
            the divider underneath the lot. None of it on an empty calendar:
            they are all ways of looking at something. */}
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
            body="Add a class you're going to, or follow a coach and pick from their week."
            addLabel="Add a class"
            findCoach
            onAdd={() => setAddMenu(true)}
          />
        ) : view === "month" ? (
          <MonthScroll
            todayIso={todayIso}
            items={monthItems}
            onDay={openDay}
            onMonthInView={setYm}
          />
        ) : view === "day" ? (
          <ClassOpener handle="">
            <h3 className="daygrid-head">{fmtDayHeaderRel(dayIso, todayIso)}</h3>
            <DayGrid
              dayIso={dayIso}
              events={(allShown.find((d) => d.iso === dayIso)?.items ?? []).map(
                (i): DayGridEvent => {
                  const [h, m] = i.hm.split(":").map(Number);
                  const at = ((h % 12) + (i.ap.toLowerCase() === "pm" ? 12 : 0)) * 60 + (m || 0);
                  return {
                    key: `${i.personal ? i.id : i.classId}|${i.iso}`,
                    kind: i.personal ? "private" : "added",
                    name: i.name,
                    at,
                    durationMin: i.durationMin,
                    where: i.where,
                    // A personal entry opens its own sheet; a real class
                    // rides the wrapping ClassOpener by its data attributes.
                    onTap: i.personal ? () => setPlan(i.id) : undefined,
                    classId: i.personal ? undefined : i.classId,
                    iso: i.iso,
                    base: i.personal ? undefined : i.handle,
                  };
                },
              )}
            />
          </ClassOpener>
        ) : (
          <>
            {/* The same flat rows Following and the coach calendar draw, by
                Matt's call: one grammar for a list of classes, wherever it
                is. ClassOpener catches the tap on a real class; a personal
                one has no page, so it opens its own sheet. */}
            <ClassOpener handle="">
              <div className="callist wkflat">
                {[...pastShown, ...shown].map((d) => (
                  <section
                    key={d.iso}
                    id={`day-${d.iso}`}
                    className={`dayblock${d.iso < todayIso ? " dayblock-past" : ""}`}
                  >
                    <DayBand label={fmtDayHeaderRel(d.iso, todayIso)} today={d.iso === todayIso} />
                    <div className="dayrows">
                      {d.items.map((i) => {
                        const key = rowKey(i);
                        const src = byKey[key];
                        const row: WeekRow = {
                          key,
                          name: i.name,
                          where: i.where,
                          hm: i.hm,
                          ap: i.ap,
                          dur: `${i.durationMin} min`,
                          coach:
                            !i.personal && i.coachName
                              ? {
                                  id: "",
                                  name: i.coachName,
                                  color: i.coachColor ?? "var(--cl)",
                                  photo: i.coachPhoto ?? null,
                                }
                              : null,
                          // A personal entry's bottom line: who it is with
                          // when they wrote one down, Added by you when not.
                          tag: i.personal ? i.coachName?.trim() || "Added by you" : undefined,
                          href: i.personal
                            ? null
                            : `/${i.handle}/${i.classId}?d=${i.iso}&from=week`,
                          classId: i.personal ? undefined : i.classId,
                          iso: i.iso,
                          base: i.personal ? undefined : i.handle,
                          onTap: i.personal ? () => setPlan(i.id) : undefined,
                          // People you both follow, going to the same one.
                          // The whole payoff of following a member.
                          extra:
                            src?.alsoGoing && src.alsoGoing.length > 0 ? (
                              <span className="weekrow-also">
                                {src.alsoGoing.slice(0, 3).map((p, idx) =>
                                  p.photo ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img key={idx} className="weekrow-alsoav" src={p.photo} alt="" />
                                  ) : (
                                    <span
                                      key={idx}
                                      className="weekrow-alsoav weekrow-alsoav-empty"
                                      style={{ background: p.color }}
                                      aria-hidden="true"
                                    >
                                      {(p.name.charAt(0) || "?").toUpperCase()}
                                    </span>
                                  ),
                                )}
                                <span className="weekrow-alsotxt">
                                  {src.alsoGoing.length === 1
                                    ? `${src.alsoGoing[0].name.split(/\s+/)[0]} is going too`
                                    : `${src.alsoGoing[0].name.split(/\s+/)[0]} and ${
                                        src.alsoGoing.length - 1
                                      } more are going too`}
                                </span>
                              </span>
                            ) : undefined,
                        };
                        return (
                          <div key={key} className="clrow">
                            <ClassLine row={row} />
                            {/* Every row can leave. A calendar's entries
                                don't; a list's do, and that difference is
                                most of what keeps this from reading as
                                one. */}
                            <button
                              className="weekrow-x"
                              aria-label={`Remove ${src.name}`}
                              onClick={() =>
                                setConfirm({
                                  classId: src.classId,
                                  iso: src.iso,
                                  key,
                                  name: src.name,
                                  personalId: src.personal ? src.id : undefined,
                                })
                              }
                            >
                              <Icon name="close" size={18} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </ClassOpener>
            {namedCoach && (
              <button className="weekinvite" onClick={() => setInviteOpen(true)}>
                Is {namedCoach.split(/\s+/)[0]} on fittlist? Send them your invite link
              </button>
            )}
          </>
        )}
      </div>
      {/* The two floating doors: back to now, and the week as a poster.
          Neither is offered over an empty calendar: Today lands on nothing,
          and the empty state's own two buttons are the only way on. */}
      {!bare && (
      <CalBottomBar
        onToday={() => {
          // In the Day view Today stays a day: it walks the strip home.
          if (view === "day") {
            setDayIso(todayIso);
            setYm(todayIso.slice(0, 7));
            return;
          }
          pickView("list");
          requestAnimationFrame(() => requestAnimationFrame(scrollToToday));
        }}
        onAdd={() => setAddMenu(true)}
      />
      )}

      {/* The share moment, on the week rather than on the row that made it.
          Only where there is a week to draw: landing on an empty one and
          being offered a picture of it is the app talking to itself. */}
      {weekShare && !bare && (
        <div className="folhint weekadded" role="status" aria-live="polite">
          <p className="folhint-t">
            Your week can go out as a picture, the classes you&rsquo;re going to and where.
          </p>
          <div className="folhint-row">
            <button
              className="folhint-go"
              onClick={() => {
                closeWeekShare(true);
                router.push("/share");
              }}
            >
              Share my week
            </button>
            <button className="folhint-off" onClick={() => closeWeekShare(true)}>
              Not now
            </button>
          </div>
        </div>
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
          present={(["added", "private"] as CalKind[]).filter((k) => presentKinds.has(k))}
          // Never "coaching": a member cannot publish a class, so offering it
          // here would be a door onto a wall.
          absent={(["added", "private"] as CalKind[]).filter((k) => !presentKinds.has(k))}
          on={kindOn}
          onToggle={toggleKind}
          onAdd={(k) => {
            setFilterSheet(false);
            setPersonalEvent(k === "private");
            setAddOpen(true);
          }}
          onClose={() => setFilterSheet(false)}
        />
      )}

      {/* Which kind this one is. A class gets the full form; anything else
          gets the same form with the class-shaped parts put away. */}
      {addMenu && (
        <AddBrowse
          onClose={() => setAddMenu(false)}
          onAddNew={() => {
            setAddMenu(false);
            setPersonalEvent(false);
            setAddOpen(true);
          }}
          onEvent={() => {
            setAddMenu(false);
            setPersonalEvent(true);
            setAddOpen(true);
          }}
        />
      )}
      {addOpen && (
        <Adder
          studios={studios}
          templates={templates}
          customTypes={customTypes}
          lastUsed={lastUsed}
          subsCount={0}
          firstPublish={false}
          personal={{ canCoach: false, event: personalEvent }}
          onClose={() => setAddOpen(false)}
          onToast={toast}
          onPublished={(msg, planId) => {
            setAddOpen(false);
            router.refresh();
            if (planId) setJustAdded(planId);
            else toast(msg);
          }}
          onDeleted={(msg) => {
            setAddOpen(false);
            toast(msg);
            router.refresh();
          }}
          onMatch={(m, again) => {
            // The match stands alone; two stacked sheets read as a collision.
            // `again` still holds everything they typed.
            setAddOpen(false);
            setMatch({ m, again });
          }}
        />
      )}
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
            setEdit({
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
      {edit && (
        <Adder
          studios={studios}
          templates={templates}
          customTypes={customTypes}
          lastUsed={lastUsed}
          subsCount={0}
          firstPublish={false}
          personal={{ canCoach: false, editId: edit.id }}
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
      {/* The same shape the follow hint uses: a line, one thing to do about
          it, and a way to say no. */}
      {justAdded && (
        <div className="folhint weekadded" role="status" aria-live="polite">
          <p className="folhint-t">
            {personalEvent ? "Added to your calendar." : "Added to your plans."}
          </p>
          <div className="folhint-row">
            <button
              className="folhint-go"
              onClick={() => {
                setShareId(justAdded);
                setJustAdded(null);
              }}
            >
              Share it as a picture
            </button>
            <button className="folhint-off" onClick={() => setJustAdded(null)}>
              Close
            </button>
          </div>
        </div>
      )}
      {shareId && (
        <PlanSheet
          id={shareId}
          share
          onClose={() => setShareId(null)}
          onToast={toast}
          onRemoved={(msg) => {
            setShareId(null);
            toast(msg);
            router.refresh();
          }}
          onEdit={() => setShareId(null)}
        />
      )}
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
              <button className="btn si" disabled={pBusy} onClick={addTheRealOne}>
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
      {inviteOpen && (
        <InviteSheet
          onClose={() => setInviteOpen(false)}
          onCopied={() => toast("Link copied, ready to paste")}
        />
      )}
      {confirm && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirm(null);
          }}
        >
          <div className="sheet confirmsheet">
            <h2>{confirm.personalId ? "Remove it?" : "Take it out of your plans?"}</h2>
            <p className="lead">
              {confirm.personalId ? (
                <>
                  {confirm.name} comes off your calendar. You typed this one, so adding it back
                  means typing it again.
                </>
              ) : (
                <>
                  {confirm.name} comes off your list. You can add it back from the coach&rsquo;s
                  schedule any time.
                </>
              )}
            </p>
            <div className="publishwrap nostick">
              <button
                className="btn si"
                onClick={() => remove(confirm.classId, confirm.iso, confirm.key, confirm.personalId)}
              >
                Remove it
              </button>
              <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => setConfirm(null)}>
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

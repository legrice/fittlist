"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { clockParts, fmtDayHeader, occurrenceEnded, runsOn, timeToMinutes } from "@/lib/format";
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
import { Icon } from "@/components/Icon";
import { InvitesBanner } from "@/components/InvitesBanner";
import { Toast, useToast } from "@/components/Toast";

// One week at a time: the button at the bottom asks for the next one.
const INITIAL_WEEKS = 1;
const MAX_WEEKS = 52;

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
  // Which slice of the calendar you're looking at: one tab under the rail,
  // not a stack of switches behind a circle. All on arrival, every time; a
  // tab is a way of looking, not a fact worth storing.
  const [calTab, setCalTab] = useState<"all" | "coaching" | "added" | "private">("all");
  const [weeks, setWeeks] = useState(INITIAL_WEEKS);
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
  // A tab is only offered where it can narrow something: which kinds this
  // calendar actually holds. Coaching covers shifts too; a shift is you
  // working, whoever owns the row.
  const presentKinds = useMemo(() => {
    const seen = new Set<"coaching" | "added" | "private">();
    if (classes.length) seen.add("coaching");
    for (const d of plans) for (const p of d.items) seen.add(p.personal ? "private" : "added");
    return seen;
  }, [classes, plans]);
  // The kind a stale tab named can leave the calendar (the last added class
  // passes, say); the list falls back to everything rather than to nothing.
  const tab = calTab === "all" || presentKinds.has(calTab) ? calTab : "all";

  const days = useMemo(() => {
    const plansByIso = new Map(plans.map((d) => [d.iso, d.items]));
    const start = new Date(`${todayIso}T00:00:00Z`);
    const out: { iso: string; label: string; items: ClassDto[]; extras: WeekItem[] }[] = [];
    for (let i = 0; i < MAX_WEEKS * 7 && out.length < weeks * 7; i++) {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + i);
      const iso = d.toISOString().slice(0, 10);
      const dow = (d.getUTCDay() + 6) % 7; // 0 = Monday
      const items =
        tab === "all" || tab === "coaching"
          ? classes
              .filter((c) => runsOn(c, iso, dow))
              // Been and gone: once the hour has passed the row comes off,
              // here and on every other schedule, the same as a member's week.
              .filter((c) => !occurrenceEnded(iso, c.startTime, c.durationMin))
              .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
          : [];
      // The other half of your calendar: the classes you added and your own
      // entries, from the same loader the member calendar reads.
      const extras =
        tab === "coaching"
          ? []
          : (plansByIso.get(iso) ?? []).filter(
              (p) => tab === "all" || (tab === "private") === !!p.personal,
            );
      if (items.length || extras.length) {
        out.push({ iso, label: fmtDayHeader(iso), items, extras }); // "Monday — Jul 20"
      }
    }
    return out;
  }, [classes, plans, todayIso, weeks, tab]);

  // Hand a row on: the class page's link through the system share sheet,
  // clipboard where there isn't one. A shift shares the gym's page for it,
  // which is the page a member can actually open.
  const shareRow = async (path: string, rowName: string) => {
    const url = `${window.location.origin}${path}`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: rowName, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast("Link copied, ready to paste");
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") toast(url);
    }
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

        {/* The calendar leads: the tools rail that rode across its top lives
            on the You tab now, and the Schedule tab is the week and nothing
            else. */}
        <div className="calhead-row">
          <h2 className="calhead">Your schedule</h2>
          {/* The plus, across from the calendar's name: it floated for a
              while, and the corner it held is being kept clear for a full
              size calendar someday. It still asks which hat first. */}
          <button
            className="calhead-add"
            onClick={() => (showFanView ? setAddMenu(true) : setAdder({ open: true }))}
          >
            <Icon name="add" size={15} /> Add
          </button>
        </div>
        {/* The slices of the calendar, as the same underline tabs a profile's
            sections wear. All leads, then only the kinds this calendar
            actually holds; one kind would make All a tab with no job, so the
            row waits for a second. */}
        {presentKinds.size > 1 && (
          <div className="pubtabs distabs caltabs" aria-label="Calendar filter">
            {(
              [
                { k: "all" as const, t: "All" },
                { k: "coaching" as const, t: "Teaching" },
                { k: "added" as const, t: "Going" },
                { k: "private" as const, t: "Personal" },
              ]
            )
              .filter((x) => x.k === "all" || presentKinds.has(x.k))
              .map((x) => (
                <button
                  key={x.k}
                  className={`pubtab${tab === x.k ? " sel" : ""}`}
                  aria-current={tab === x.k ? "page" : undefined}
                  onClick={() => setCalTab(x.k)}
                >
                  {x.t}
                </button>
              ))}
          </div>
        )}
        {!hasAnyClass && plans.length === 0 ? (
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
        ) : days.length === 0 ? (
          <p className="ps-none">Nothing coming up. Add a class to fill your calendar.</p>
        ) : (
          <>
            <div className="ps-week ps-agenda evcards evcards-tight">
              {days.map((d) => (
                <div key={d.iso} id={`day-${d.iso}`} className="ps-daygroup">
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
                            className="ps-event"
                            data-plan={p.personal ? "yours" : "going"}
                            onClick={() =>
                              p.personal
                                ? setPlan(p.id)
                                : setGoingOpen({ base: p.handle, classId: p.classId, iso: p.iso })
                            }
                          >
                            <span className="ps-ebody">
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
                              {p.where && (
                                <span className="ps-estudio">
                                  <Icon name="place" size={13} className="ps-estudio-ic" />
                                  {p.where}
                                </span>
                              )}
                            </span>
                            <span className="ps-etimecol">
                              <span className="ps-etime">
                                {p.hm}
                                <span className="ps-ap">{p.ap}</span>
                              </span>
                              <span className="ps-edur">{p.durationMin} min</span>
                            </span>
                            {/* The badge holds the card's corner, fixed, so it
                                neither rides the name nor moves with its
                                length. A personal row carries nothing: the
                                tab already says why it's here. */}
                            {!p.personal && (
                              <span className="ps-corner ps-corner-going">Going</span>
                            )}
                          </button>
                          {/* A sibling, never a child: a button inside a
                              button is not a thing. Yours-alone entries have
                              no page to hand on; their picture lives in the
                              sheet. */}
                          {!p.personal && (
                            <button
                              className="evcard-share lone"
                              aria-label={`Share ${p.name}`}
                              onClick={() => shareRow(`/${p.handle}/${p.classId}?d=${p.iso}`, p.name)}
                            >
                              <Icon name="ios_share" size={17} />
                            </button>
                          )}
                          </div>
                        );
                      }
                      const c = row.c!;
                      const studio = c.studioId ? studioById.get(c.studioId) : undefined;
                      const where = studio ? studio.name : c.location;
                      const start = clockParts(c.startTime);
                      // What a row can hand on: a shift shares the gym's
                      // page for it, a public class shares your own; a
                      // private one has no page to give.
                      const sharePath = c.shift
                        ? c.shiftBase
                          ? `/s/${c.shiftBase}/${c.id}?d=${d.iso}`
                          : null
                        : c.isPublic && !c.duplicateOf
                          ? `/${handle}/${c.id}?d=${d.iso}`
                          : null;
                      return (
                        <div key={`${d.iso}-${c.id}`} className="ps-erow">
                        <button
                          className={`ps-event${c.isPublic ? "" : " ps-event-private"}`}
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
                          <span
                            className="ps-accent"
                            style={c.isPublic ? { background: myAccent } : undefined}
                            aria-hidden="true"
                          />
                          <span className="ps-ebody">
                            <span className="ps-enm">
                              {c.name}
                              {/* Visibility and cleanup ride the name line;
                                  the relationship badge holds the corner. */}
                              {!c.isPublic && <span className="ps-private">Private</span>}
                              {c.duplicateOf && <span className="ps-dupe">Duplicate</span>}
                            </span>
                            {where && (
                              <span className="ps-estudio">
                                <Icon name="place" size={13} className="ps-estudio-ic" />
                                {where}
                              </span>
                            )}
                          </span>
                          <span className="ps-etimecol">
                            <span className="ps-etime">
                              {start.hm}
                              <span className="ps-ap">{start.ap}</span>
                            </span>
                            <span className="ps-edur">{c.durationMin} min</span>
                          </span>
                          {/* Shift means the gym put you on it; Teaching means
                              you made it. Both are you working, and the tab
                              folds them together. */}
                          {c.shift ? (
                            <span className="ps-corner ps-corner-shift">Shift</span>
                          ) : (
                            <span className="ps-corner">Teaching</span>
                          )}
                        </button>
                        {sharePath && (
                          <button
                            className="evcard-share lone"
                            aria-label={`Share ${c.name}`}
                            onClick={() => shareRow(sharePath, c.name)}
                          >
                            <Icon name="ios_share" size={17} />
                          </button>
                        )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
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

      {/* Everything about your page, behind the pill that wears your face.
          The rows a visitor can't have: the way in to look at it, the way in
          to change it, and every way of handing it on. */}
      <Toast msg={toastMsg} on={toastOn} />
    </section>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Adder, type AdderPrefill } from "@/components/Adder";
import { AddBrowse } from "@/components/AddBrowse";
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
import { PlanSheet } from "@/components/PlanSheet";
import { HighlightOnLand } from "@/components/HighlightOnLand";
import { Icon } from "@/components/Icon";
import { AddWeekChoices } from "@/components/AddWeekChoices";
import { ShareHubScreen, type HubItem } from "@/components/ShareHubScreen";
import { Toast, useToast } from "@/components/Toast";
import { CalendarList, WeekEmpty, type WeekDayRows } from "@/components/WeekView";
import { clockParts, dayBandLabel, occurrenceEnded, runsOn, timeToMinutes } from "@/lib/format";
import type { ClassDto, StudioDto } from "@/lib/types";
import type { WeekDay as WeekDayData, WeekItem } from "@/lib/week";
import { setGoing } from "@/app/actions/going";
import { removePersonalClass, type PersonalDetail, type PersonalMatch } from "@/app/actions/personal";
import { loadCalendarComposerData, loadCalendarShareData, loadFavoriteCalendars, type CalendarComposerData, type FavoriteCalendarData } from "@/app/actions/calendar-data";

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
  const [menuOpen, setMenuOpen] = useState(false);
  const [visible, setVisible] = useState({ coaching: !member, saved: true, personal: true });
  const [addChoice, setAddChoice] = useState(openAdder);
  const [addChoiceKind, setAddChoiceKind] = useState<"coaching" | "saved" | "personal" | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [personalAdd, setPersonalAdd] = useState(false);
  const [personalWorkout, setPersonalWorkout] = useState(false);
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
  // The overlay header's words: the day under it on the list, the month in
  // view on the grid. The grid's label is set from the first render (this
  // month is in view at rest), so the grid gates the bar on scroll depth
  // instead of on having a label at all.
  const topDay = useTopDayLabel();
  const [ymInView, setYmInView] = useState<string | null>(null);
  const scrolled = useScrolledPast(120);
  // The tapped occurrence, and the editor it can open onto.
  const [peek, setPeek] = useState<PeekClass | null>(null);
  const [plan, setPlan] = useState<string | null>(null);
  const [planEdit, setPlanEdit] = useState<{ id: string; prefill: AdderPrefill } | null>(null);
  const [edit, setEdit] = useState<{ id: string; prefill: AdderPrefill } | null>(null);
  const [toastMsg, toastOn, toast] = useToast();
  const [shareOpen, setShareOpen] = useState(false);
  const [composerData, setComposerData] = useState<CalendarComposerData | null>(null);
  const [shareData, setShareData] = useState<{ items:HubItem[]; defaultFrom:string; savedHeadline:string } | null>(null);
  const [loadingTools, startTools] = useTransition();
  const [favoriteData, setFavoriteData] = useState<FavoriteCalendarData | null>(null);
  const [favoriteLoading, startFavoriteLoading] = useTransition();
  const [selectedFavorites, setSelectedFavorites] = useState<string[]>([]);
  const [overlaySaved, setOverlaySaved] = useState<Record<string,boolean>>({});
  const activeFilterCount = Number(visible.coaching) + Number(visible.saved) + Number(visible.personal);
  const favoriteSelectionKey = `fl-calendar-favorites:${viewer.id}`;

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
  const openFilters = () => {
    setMenuOpen(true);
    if (!favoriteData) startFavoriteLoading(async () => setFavoriteData(await loadFavoriteCalendars() ?? { people:[], events:[] }));
  };
  const rememberFavoriteSelection = useCallback((ids:string[]) => {
    const next=ids.slice(0,2);
    setSelectedFavorites(next);
    try { localStorage.setItem(favoriteSelectionKey,JSON.stringify(next)); } catch { /* private mode */ }
  },[favoriteSelectionKey]);
  const toggleFavorite = (id:string) => rememberFavoriteSelection(selectedFavorites.includes(id) ? selectedFavorites.filter((value) => value !== id) : selectedFavorites.length < 2 ? [...selectedFavorites,id] : selectedFavorites);

  useEffect(() => {
    let stored:string[]=[];
    try {
      const value=JSON.parse(localStorage.getItem(favoriteSelectionKey) ?? "[]");
      if(Array.isArray(value)) stored=value.filter((id):id is string=>typeof id==="string").slice(0,2);
    } catch { /* malformed or unavailable storage */ }
    if(!stored.length) return;
    setSelectedFavorites(stored);
    let cancelled=false;
    void loadFavoriteCalendars().then((data)=>{
      if(cancelled||!data)return;
      setFavoriteData(data);
      const available=new Set(data.people.map((person)=>person.id));
      const valid=stored.filter((id)=>available.has(id));
      rememberFavoriteSelection(valid);
    });
    return ()=>{cancelled=true;};
  },[favoriteSelectionKey,rememberFavoriteSelection]);

  useEffect(() => {
    if (!shareOpen && !menuOpen) return;
    document.body.classList.add("sheet-open");
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      setShareOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.classList.remove("sheet-open");
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [shareOpen, menuOpen]);

  const studioById = useMemo(() => new Map(studios.map((s) => [s.id, s])), [studios]);
  const savedByIso = useMemo(
    () =>
      new Map(
        savedDays.map((day) => [
          day.iso,
          day.items.filter((item) => !gone[`added|${item.personal ? item.id : item.classId}|${item.iso}`]),
        ] as const),
      ),
    [savedDays, gone],
  );
  const favoriteByIso = useMemo(() => {
    const map = new Map<string,FavoriteCalendarData["events"]>();
    for (const event of favoriteData?.events ?? []) {
      if (!selectedFavorites.includes(event.personId) || overlaySaved[`${event.classId}|${event.iso}`]) continue;
      map.set(event.iso,[...(map.get(event.iso) ?? []),event]);
    }
    return map;
  },[favoriteData,selectedFavorites,overlaySaved]);
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
    // List is a continuous upcoming schedule, not a disguised week view.
    // Eight weeks keeps it useful without rendering an unbounded recurrence.
    for (let i = 0; i < 56; i++) {
      const d = new Date(start + i * 864e5);
      const iso = d.toISOString().slice(0, 10);
      const dow = (d.getUTCDay() + 6) % 7;
      const coachingRows = classes
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
            coach: viewer,
            tag: "Coaching",
            tagTone: "coaching" as const,
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
        coach:
          !i.personal && i.coachName
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
      const favoriteRows = (favoriteByIso.get(iso) ?? []).map((event) => {
        const person = favoriteData?.people.find((item) => item.id === event.personId);
        const key = `${event.classId}|${event.iso}`;
        return {
          key:`overlay|${event.personId}|${key}`, classId:event.classId, iso:event.iso, base:event.base,
          name:event.name, where:event.where, hm:event.hm, ap:event.ap,
          coach:person ? { id:person.id, name:person.name, photo:person.photo, color:person.color } : null,
          overlayColor:person?.color,
          href:`/${event.base}/${event.classId}?d=${event.iso}&from=schedule`,
          corner:<button type="button" className="calendar-overlay-save" onClick={() => startRemove(async () => {
            setOverlaySaved((current) => ({...current,[key]:true}));
            const result=await setGoing(event.classId,event.iso,true);
            if(!result.ok){setOverlaySaved((current)=>({...current,[key]:false}));toast(result.error??"Couldn't save that class");return;}
            toast(`${event.name} was saved to your calendar`);router.refresh();
          })}><Icon name="bookmark" size={17}/>Save</button>,
        };
      });
      const rows = [
        ...(visible.coaching ? coachingRows : []),
        ...addedRows.filter((row) => row.tagTone === "personal" ? visible.personal : visible.saved),
        ...favoriteRows,
      ].sort((a, b) => atOf(a) - atOf(b));
      if (rows.length) out.push({ iso, label: dayBandLabel(iso, todayIso), today: iso === todayIso, rows });
    }
    return out;
  }, [classes, todayIso, studioById, handle, visible, savedByIso, favoriteByIso, favoriteData, router, viewer]);

  /** The month grid reads the same rows, over its own longer range: it is a
   *  different way of looking at the calendar, not a different calendar. */
  const monthItems = useMemo(() => {
    const m = new Map<string, MonthCellItem[]>();
    const start = Date.parse(`${todayIso}T00:00:00Z`) - 62 * 864e5;
    for (let i = 0; i < 62 + 380; i++) {
      const d = new Date(start + i * 864e5);
      const iso = d.toISOString().slice(0, 10);
      const dow = (d.getUTCDay() + 6) % 7;
      const coachingRows = classes
        .filter((c) => runsOn(c, iso, dow))
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
      const favoriteRows = (favoriteByIso.get(iso) ?? []).map((event) => ({ kind:"overlay" as const, name:event.name, at:atOf(event), color:favoriteData?.people.find((person)=>person.id===event.personId)?.color }));
      const rows = [
        ...(visible.coaching ? coachingRows : []),
        ...addedRows.filter((row) => row.kind === "private" ? visible.personal : visible.saved),
        ...favoriteRows,
      ].sort((a, b) => a.at - b.at);
      if (rows.length) m.set(iso, rows);
    }
    return m;
  }, [classes, todayIso, visible, savedByIso, favoriteByIso, favoriteData]);

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
  const bare = classes.length === 0 && savedDays.every((day) => day.items.length === 0);
  const openAdd = () => {
    ensureComposer();
    setAddChoiceKind(null);
    setAddChoice(true);
  };
  const continueAdd = () => {
    if (!addChoiceKind) return;
    setAddChoice(false);
    if (addChoiceKind === "coaching") {
      setPersonalAdd(false);
      setPersonalWorkout(false);
      setAddOpen(true);
    } else if (addChoiceKind === "saved") setBrowseOpen(true);
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
      <header className="calendar-page-header">
        <h1>Calendar</h1>
        <button type="button" className="calendar-header-share" aria-label="Share your week" onClick={openShare} disabled={loadingTools && shareOpen}><Icon name="reply" className="share-arrow-forward" size={20} /><span>Share</span></button>
        <button type="button" className="calendar-menu-button" aria-label={`Filter calendar, ${activeFilterCount} selected`} onClick={openFilters}><Icon name="tune" size={22} /><span className="calendar-filter-count">{activeFilterCount}</span></button>
      </header>

      {menuOpen && <div className="calendar-drawer-scrim" onClick={(event) => { if (event.target === event.currentTarget) setMenuOpen(false); }}>
        <aside className="calendar-drawer" aria-label="Calendar controls">
          <div className="calendar-drawer-head"><h2>Calendar</h2><button type="button" className="iconbtn" aria-label="Close calendar menu" onClick={() => setMenuOpen(false)}><Icon name="close" size={20} /></button></div>
          <section className="calendar-drawer-section">
            <h3>View</h3>
            {([['list','calendar_view_day','List'],['month','calendar_month','Month']] as const).map(([value,icon,label]) => {
              const on=view===value;
              return <button type="button" className="calendar-drawer-row calendar-view-choice" aria-pressed={on} onClick={()=>{setView(value);setMenuOpen(false);}} key={value}><span className="calendar-view-choice-icon"><Icon name={icon} size={20}/></span><span>{label}</span><span className={`calendar-check${on?' on':''}`} /></button>;
            })}
          </section>
          <section className="calendar-drawer-section">
            <h3>My calendar</h3>
            {([...(member ? [] : [["coaching", "Coaching"]] as const), ["saved", "Saved"], ["personal", "Personal"]] as const).map(([value, label]) => {
              const on = visible[value];
              const icon = value === "coaching" ? "event_available" : value === "saved" ? "bookmark" : "activity";
              return <button type="button" className="calendar-drawer-row calendar-category-row" aria-pressed={on} onClick={() => setVisible((current) => ({ ...current, [value]: !current[value] }))} key={value}><span className={`calendar-category-icon calendar-category-icon-${value}`}><Icon name={icon} size={20} /></span><span>{label}</span><span className={`calendar-check calendar-check-${value}${on ? " on" : ""}`}>{on && <Icon name="check" size={16} />}</span></button>;
            })}
          </section>
          <section className="calendar-drawer-section calendar-favorite-section">
            <h3>Favorite calendars</h3>
            <small>Show up to two calendars at a time.</small>
            {favoriteLoading ? <p>Finding active calendars…</p> : favoriteData?.people.length ? <>{favoriteData.people.map((person) => {
              const on=selectedFavorites.includes(person.id); const full=!on&&selectedFavorites.length>=2;
              return <button type="button" className="calendar-drawer-row calendar-favorite-row" aria-pressed={on} disabled={full} onClick={()=>toggleFavorite(person.id)} key={person.id}>{person.photo?<img src={person.photo} alt="" loading="lazy" decoding="async"/>:<span className="calendar-favorite-avatar" style={{background:person.color}}>{person.name.charAt(0).toUpperCase()}</span>}<span>{person.name}</span><span className={`calendar-check${on?" on":""}`} style={on?{background:person.color}:undefined}>{on&&<Icon name="check" size={16}/>}</span></button>;
            })}</> : <div className="calendar-favorite-empty"><span><Icon name="travel_explore" size={24}/></span><strong>Find favorite calendars</strong><p>Favorite people with upcoming classes, then their calendars will appear here.</p><Link href="/discover?half=people" onClick={()=>setMenuOpen(false)}>Discover people</Link></div>}
          </section>
        </aside>
      </div>}

      {selectedFavorites.length>0 && <div className="calendar-overlay-context"><span>Showing your calendar + {selectedFavorites.map((id)=>favoriteData?.people.find((person)=>person.id===id)?.name).filter(Boolean).join(" + ")}</span><button type="button" onClick={()=>rememberFavoriteSelection([])}>Clear</button></div>}

      <div className="cardwrap calendar-cardwrap">
      {/* The title and the two ways of looking, pinned under the app header.
          `CalSticky` publishes its own height as `--dayband-top`, which is
          where every day band underneath pins: one writer for that number,
          because two screens working it out separately is how they end up
          disagreeing by a few pixels nobody can explain. */}
      <CalSticky>
        {view === "month" && <MonthHeadRow />}
      </CalSticky>

      {bare && selectedFavorites.length===0 ? (
        <WeekEmpty
          first
          title="Your week starts here"
          body="Add what you’re doing this week."
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
        <WeekEmpty
          first
          title="Nothing showing"
          body="Choose calendars from the menu, or add something to your week."
        />
      ) : (
        <CalendarList
          days={days}
        />
      )}
      </div>

      {shareOpen && (
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
              studios={studios}
              templates={composerData?.templates ?? []}
              customTypes={composerData?.customTypes ?? []}
              lastUsed={composerData?.lastUsed ?? { startTime:"06:00", durationMin:50, studioId:studios[0]?.id ?? null }}
            /> : <div className="calendar-tool-loading" aria-busy="true">Loading your share options…</div>}
          </section>
        </div>
      )}

      {/* The overlay header: nothing at rest, a glass bar once you're deep,
          naming the day (or month) under it with the toggle and Add along
          for the ride, so the two things the title row offered are never a
          long scroll away. */}
      {(!bare || selectedFavorites.length > 0) && days.length > 0 && (
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
        />
      )}

      <div className="calendar-bottom-actions" aria-label="Schedule actions">
        <button className="calendar-bottom-add" aria-label="Add to your schedule" onClick={openAdd}>
          <Icon name="add" size={28} />
        </button>
      </div>
      {addChoice && (
        <div className="sheet-scrim" onClick={(e) => { if (e.target === e.currentTarget) setAddChoice(false); }}>
          <div className="sheet addrole-sheet" role="dialog" aria-modal="true" aria-labelledby="addrole-title">
            <button className="iconbtn sheetclose" aria-label="Close" onClick={() => setAddChoice(false)}>
              <Icon name="close" size={18} />
            </button>
            <h2 id="addrole-title">Add to your week</h2>
            <p className="lead">What are you doing?</p>
            <AddWeekChoices
              canCoach={!member}
              selected={addChoiceKind}
              onSelect={setAddChoiceKind}
            />
            <button type="button" className="addrole-continue" disabled={!addChoiceKind} onClick={continueAdd}>Continue</button>
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
          personal={
            personalAdd
              ? { canCoach: false, event: personalWorkout, oneOff: true }
              : undefined
          }
          onClose={() => {
            setAddOpen(false);
            setPersonalAdd(false);
            setPersonalWorkout(false);
          }}
          onToast={toast}
          onPublished={(msg) => {
            setAddOpen(false);
            setPersonalAdd(false);
            setPersonalWorkout(false);
            toast(msg);
            router.refresh();
          }}
          onDeleted={(msg) => {
            setAddOpen(false);
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

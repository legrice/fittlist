"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Adder, type AdderPrefill } from "@/components/Adder";
import { ClassPeek, type PeekClass } from "@/components/ClassPeek";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";
import { WeekDays, WeekEmpty, WeekStepper, type WeekDayRows } from "@/components/WeekView";
import { clockParts, runsOn, timeToMinutes, weekDates } from "@/lib/format";
import type { ClassDto, LastUsed, StudioDto, TemplateDto } from "@/lib/types";

/**
 * A coach's own week: the classes they teach, and nothing else.
 *
 * This screen used to be everybody's calendar. It held what you teach, the
 * shifts a gym had you on, the classes you had saved off somebody else's page
 * and your own private entries, four relationships deep, each with its own
 * colour and its own tap behaviour, and a legend in a sheet to explain them.
 * It is one thing now: what you teach. A member has no calendar at all, and
 * the going marks and personal entries that filled this one are gone from
 * every screen.
 *
 * That is the whole simplification said in one screen. Build a calendar, share
 * a calendar, follow a calendar.
 */
export function CalendarScreen({
  classes,
  todayIso,
  studios,
  templates,
  customTypes,
  lastUsed,
  subsCount,
}: {
  classes: ClassDto[];
  todayIso: string;
  studios: StudioDto[];
  templates: TemplateDto[];
  customTypes: string[];
  lastUsed: LastUsed;
  subsCount: number;
}) {
  const router = useRouter();
  const [week, setWeek] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  // The tapped occurrence, and the editor it can open onto.
  const [peek, setPeek] = useState<PeekClass | null>(null);
  const [edit, setEdit] = useState<{ id: string; prefill: AdderPrefill } | null>(null);
  const [toastMsg, toastOn, toast] = useToast();

  const studioById = useMemo(() => new Map(studios.map((s) => [s.id, s])), [studios]);

  const days: WeekDayRows[] = useMemo(() => {
    return weekDates(week, todayIso)
      .map((iso) => {
        const d = new Date(`${iso}T00:00:00Z`);
        const dow = (d.getUTCDay() + 6) % 7;
        const rows = classes
          .filter((c) => runsOn(c, iso, dow))
          .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
          .map((c) => {
            const t = clockParts(c.startTime);
            const st = c.studioId ? studioById.get(c.studioId) : null;
            return {
              key: `${c.id}|${iso}`,
              name: c.name,
              where: st?.name ?? c.location ?? null,
              hm: t.hm,
              ap: t.ap,
              onTap: () => setPeek(peekOf(c, iso, st?.name ?? c.location ?? null)),
            };
          });
        return {
          iso,
          dow: d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }).toUpperCase(),
          date: String(d.getUTCDate()),
          rows,
        };
      })
      .filter((d) => d.rows.length > 0);
  }, [classes, week, todayIso, studioById]);

  // Whether this account has anything at all, not whether this week does: the
  // first week's empty state offers the thing to do, and a later one only says
  // there is nothing there, because "add your first class" is wrong advice on
  // a week somebody flipped forward to.
  const bare = classes.length === 0;

  return (
    <>
      <WeekStepper week={week} onWeek={setWeek} />

      {days.length === 0 ? (
        <WeekEmpty
          first={week === 0 || bare}
          title="Your week is empty"
          body="Put the classes you teach up here. That is the whole app: your week, at one link, kept current."
          cta="Add your first class"
          onCta={() => setAddOpen(true)}
        />
      ) : (
        <WeekDays days={days} />
      )}

      {/* The plus only once there is a week to add to: an empty calendar
          carries the CTA in its own block, and two buttons saying the same
          thing is one of them explaining the other. */}
      {days.length > 0 && (
        <button className="wkfab" aria-label="Add a class" onClick={() => setAddOpen(true)}>
          <Icon name="add" size={26} strokeWidth={2.6} />
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

/** The tapped occurrence, as the sheet wants it. `MON · AUG 3` is the date
 *  said the way the design says it, and it lives here rather than in the sheet
 *  because only the caller knows which date was tapped. */
function peekOf(c: ClassDto, iso: string, where: string | null): PeekClass {
  const d = new Date(`${iso}T00:00:00Z`);
  const dow = d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }).toUpperCase();
  const md = d
    .toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    .toUpperCase();
  const t = clockParts(c.startTime);
  return {
    id: c.id,
    iso,
    name: c.name,
    when: `${dow} \u00b7 ${md}`,
    time: `${t.hm} ${t.ap.toLowerCase()}`,
    studio: where,
    repeats: c.specificDate ? "Once" : "Weekly",
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

"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Adder, type AdderPrefill } from "@/components/Adder";
import { ClassOpener } from "@/components/ClassOpener";
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
              href: `#${c.id}`,
              classId: c.id,
              iso,
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
        <ClassOpener handle="">
          <WeekDays days={days} />
        </ClassOpener>
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
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}

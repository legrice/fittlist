"use client";

import { Agenda, ClassRow } from "@/components/Agenda";
import { ClassCardActions } from "@/components/ClassCardActions";
import { ClassOpener } from "@/components/ClassOpener";
import { fmtDayHeaderRel } from "@/lib/format";
import type { DirClass } from "@/lib/discoverclasses";

/** One day, one heading: the grouped shape every schedule in the app takes.
 *  It lives here rather than beside DirClass because this is the only thing
 *  that groups them, and `discoverclasses` reaches the database: importing a
 *  value from it into a client component drags pg into the browser bundle. */
function groupClassDays(classes: DirClass[]): { iso: string; items: DirClass[] }[] {
  const byIso = new Map<string, DirClass[]>();
  for (const c of classes) {
    const arr = byIso.get(c.iso) ?? [];
    arr.push(c);
    byIso.set(c.iso, arr);
  }
  return [...byIso.entries()].map(([iso, items]) => ({ iso, items }));
}

/**
 * A list of dated class occurrences, day by day.
 *
 * Discover's Classes half and the search screen both draw this, so it is one
 * component rather than two that started identical: the ribbon has to mean
 * here exactly what it means on a profile, and a second copy would drift
 * where nobody was looking. The only thing the caller chooses is the `from`
 * token, because that is the one honest difference between them: which list
 * a class was opened out of, and therefore where its back control returns.
 */
export function ClassResults({
  classes,
  todayIso,
  from,
}: {
  classes: DirClass[];
  todayIso: string;
  from: "discover" | "search";
}) {
  const byKey = new Map(classes.map((c) => [`${c.classId}|${c.iso}`, c]));
  return (
    <ClassOpener handle="">
      <Agenda
        className="callist"
        today={todayIso}
        days={groupClassDays(classes).map((d) => ({
          iso: d.iso,
          label: fmtDayHeaderRel(d.iso, todayIso),
          items: d.items.map((c) => ({
            key: `${c.classId}|${c.iso}`,
            name: c.name,
            hm: c.hm,
            ap: c.ap,
            durationMin: c.durationMin,
            where: c.where,
            coachName: c.coachName,
            coachPhoto: c.coachPhoto,
            coachColor: c.coachColor,
            href: `/${c.base}/${c.classId}?d=${c.iso}&from=${from}`,
            classId: c.classId,
            iso: c.iso,
            base: c.base,
          })),
        }))}
        row={(item) => {
          const src = byKey.get(item.key);
          return (
            <>
              <ClassRow item={item} />
              {/* The ribbon, the one control a class row carries anywhere.
                  Not for one of your own. */}
              {src && (
                <ClassCardActions
                  classId={src.classId}
                  iso={src.iso}
                  name={src.name}
                  canAdd={!src.mine}
                  initialOn={src.added}
                />
              )}
            </>
          );
        }}
      />
    </ClassOpener>
  );
}

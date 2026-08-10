"use client";

import { ClassOpener } from "@/components/ClassOpener";
import type { DirClass } from "@/lib/discoverclasses";

/**
 * A list of dated class occurrences, in Home's own card grammar: the date
 * as a leaf on the left, the class, time, place and coach beside it, one
 * card per occurrence. It wore the old evcard rows and day headings for a
 * while; the leaf carries the date now, so the headings had nothing left
 * to say. Search draws it, and anything else that lists occurrences
 * should draw it too rather than a second copy.
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
  return (
    <ClassOpener handle="">
      <div className="upstack">
        {classes.map((c) => {
          const d = new Date(`${c.iso}T00:00:00Z`);
          const dow =
            c.iso === todayIso
              ? "Today"
              : d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
          return (
            <a
              key={`${c.classId}|${c.iso}`}
              className="uprail-go upstack-card"
              href={`/${c.base}/${c.classId}?d=${c.iso}&from=${from}`}
              data-cid={c.classId}
              data-d={c.iso}
              data-base={c.base}
            >
              <span className={`uprail-date${c.iso === todayIso ? " today" : ""}`}>
                <span className="uprail-dow">{dow}</span>
                <span className="uprail-dom">{d.getUTCDate()}</span>
              </span>
              <span className="uprail-txt">
                <span className="uprail-nm">{c.name}</span>
                <span className="uprail-sub">
                  {c.hm}
                  {c.ap.toLowerCase()}
                  {c.where ? ` · ${c.where}` : ""}
                </span>
                {c.coachName && (
                  <span className="uprail-who">{c.coachName.split(/\s+/)[0]}</span>
                )}
              </span>
            </a>
          );
        })}
      </div>
    </ClassOpener>
  );
}

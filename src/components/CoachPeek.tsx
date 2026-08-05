"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { coachPeek, type Peek } from "@/app/actions/peek";
import { setGoing } from "@/app/actions/going";
import { Icon } from "@/components/Icon";
import { initialOf } from "@/lib/avatar";

/**
 * One coach's fortnight, opened from their circle, and the place you save from.
 *
 * The pull model rests on this sheet: nothing a coach publishes reaches your
 * calendar until you put it there, so this is the only door and it has to be
 * one tap deep from the face. It wears the bottom sheet rather than the class
 * overlay because it is a list you skim and act on several times before
 * closing, and the overlay's shape says "one thing, whole screen".
 *
 * Rows are the calendar's own `ClassCard`, not a second design: a class has to
 * look the same wherever it is offered, or saving one teaches you nothing about
 * the screen you land back on.
 */
export function CoachPeek({
  id,
  name,
  photo,
  color,
  onClose,
}: {
  id: string;
  /** Passed in from the circle rather than waited for: the sheet names whose
   *  week it is on the first frame, and the list arrives under it. */
  name: string;
  photo: string | null;
  color: string;
  onClose: () => void;
}) {
  const [peek, setPeek] = useState<Peek | null>(null);
  const [missing, setMissing] = useState(false);
  // The mark, locally, so the ribbon fills on the tap rather than on the
  // round trip. Keyed the way the loader keys it.
  const [marks, setMarks] = useState<Record<string, boolean>>({});
  const [, startTransition] = useTransition();

  useEffect(() => {
    coachPeek(id).then((res) => (res ? setPeek(res) : setMissing(true)));
  }, [id]);

  const save = (classId: string, iso: string, on: boolean) => {
    const key = `${classId}|${iso}`;
    setMarks((m) => ({ ...m, [key]: on }));
    startTransition(async () => {
      const res = await setGoing(classId, iso, on);
      // Put it back if the server disagreed. No toast: the sheet is still
      // open and the ribbon flipping back is the message.
      if (!res.ok) setMarks((m) => ({ ...m, [key]: !on }));
    });
  };

  return (
    <div
      className="sheet-scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet sheet-full peeksheet">
        {/* The face and the name are the heading. There is no second title row
            above them: the sheet said the name once in a bar and again beside
            the photograph, which is one name too many on a sheet whose whole
            job is to say whose week this is. */}
        <div className="peekhead">
          <span className="peekav">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt="" />
            ) : (
              <span className="peekav-ini" style={{ background: color }}>
                {initialOf(name)}
              </span>
            )}
          </span>
          <div className="peekhead-txt">
            <h2 className="peekhead-nm">{name}</h2>
            {peek?.handle && (
              <Link className="peekhead-go" href={`/${peek.handle}`}>
                See their page
                <Icon name="chevron_right" size={16} />
              </Link>
            )}
          </div>
          <button className="iconbtn sheetclose peekclose" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={16} />
          </button>
        </div>

        {missing && <p className="peekempty">That schedule isn&rsquo;t available.</p>}

        {peek && !peek.days.length && (
          <p className="peekempty">
            {name} has nothing up for the next couple of weeks. Their circle lights up when they
            do.
          </p>
        )}

        {peek?.days.map((d) => (
          <div key={d.iso} className="peekday">
            <p className="peekday-h">{d.label}</p>
            {d.items.map((it) => {
              const key = `${it.classId}|${it.iso}`;
              const on = marks[key] ?? it.saved;
              return (
                <div key={key} className="peekrow">
                  <Link className="peekrow-go" href={`/${it.base}/${it.classId}?d=${it.iso}`}>
                    <span className="peekrow-nm">{it.name}</span>
                    <span className="peekrow-sub">
                      {it.hm}
                      <span className="peekrow-ap">{it.ap.toLowerCase()}</span> &middot;{" "}
                      {it.durationMin} min
                      {it.where ? ` · ${it.where}` : ""}
                    </span>
                  </Link>
                  <button
                    className={`peekadd${on ? " on" : ""}`}
                    onClick={() => save(it.classId, it.iso, !on)}
                    aria-label={on ? `Added to your plans: ${it.name}` : `Add ${it.name}`}
                  >
                    <Icon name={on ? "bookmark_added" : "bookmark"} size={20} />
                    <span>{on ? "Added" : "Add"}</span>
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

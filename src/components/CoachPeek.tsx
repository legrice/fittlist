"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { coachPeek, type Peek } from "@/app/actions/peek";
import { setGoing } from "@/app/actions/going";
import { ClassOpener } from "@/components/ClassOpener";
import { Icon } from "@/components/Icon";
import { SwipeGoing } from "@/components/SwipeGoing";
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
                <Icon name="chevron_right" size={18} />
              </Link>
            )}
          </div>
          <button className="iconbtn sheetclose peekclose" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={18} />
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
                // The swipe came with the merged week it used to live on. It
                // belongs here for the same reason the tray does: saving is
                // the act this release turns on, and the cheapest version of
                // it is one drag without aiming at a button.
                <SwipeGoing key={key} going={on} onToggle={() => save(it.classId, it.iso, !on)}>
                {/* A class opens as a sheet from a list and as a page from a
                    link, and a peek is a list. Left as a bare href the row
                    navigated, which threw the peek away: you tapped one class
                    out of a fortnight and landed somewhere with no way back to
                    the other thirteen.

                    Inside the swipe, not around it. Both catch the click in
                    the capture phase, so the outer one goes first: with
                    ClassOpener around the list, every completed swipe also
                    opened the class it had just saved. The gesture is the
                    ancestor now, so its stopPropagation lands before this
                    ever sees the event. */}
                <ClassOpener handle="">
                <div className="peekrow">
                  <Link
                    className="peekrow-go"
                    href={`/${it.base}/${it.classId}?d=${it.iso}`}
                    data-cid={it.classId}
                    data-d={it.iso}
                    data-base={it.base}
                  >
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
                    aria-label={on ? `Saved: ${it.name}` : `Save ${it.name}`}
                  >
                    <Icon name={on ? "bookmark_added" : "bookmark"} size={22} />
                    <span>{on ? "Saved" : "Save"}</span>
                  </button>
                </div>
                </ClassOpener>
                </SwipeGoing>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

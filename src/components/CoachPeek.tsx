"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { personPeek, type Peek } from "@/app/actions/peek";
import { setGoing } from "@/app/actions/going";
import { ClassOpener } from "@/components/ClassOpener";
import { Icon } from "@/components/Icon";
import { SwipeGoing } from "@/components/SwipeGoing";
import { initialOf } from "@/lib/avatar";
import { announceSaved } from "@/components/SaveEducation";

/**
 * One person's week, opened from their circle, and the place you save from.
 *
 * Everything they coach plus everything they saved, in time order, as a
 * live calendar rather than an image: the same rows as anywhere else, with
 * ribbons that work. Classes they lead carry a Coaching tag, which is the
 * only place in the app where coach and member differ. Anything you have
 * also saved is marked "You saved this too": the overlap marker is the
 * point of the whole feature, "you're going to that, I'm going to that"
 * without anyone declaring anything beyond a save.
 *
 * The header carries Follow / Following, because a week worth peeking at is
 * the moment of intent. No stars anywhere: Follow is the one relationship
 * word, per the updates brief.
 */
export function CoachPeek({
  id,
  name,
  photo,
  color,
  self = false,
  scheduleOnly = false,
  shareHref,
  onClose,
}: {
  id: string;
  /** Passed in from the circle rather than waited for: the sheet names whose
   *  week it is on the first frame, and the list arrives under it. */
  name: string;
  photo: string | null;
  color: string;
  /** Your own face uses this same week sheet, but swaps Follow for Share. */
  self?: boolean;
  /** Following is about a coach's published schedule, not classes they have
   * privately added for themselves. */
  scheduleOnly?: boolean;
  shareHref?: string;
  onClose: () => void;
}) {
  const [peek, setPeek] = useState<Peek | null>(null);
  const [missing, setMissing] = useState(false);
  // The mark, locally, so the ribbon fills on the tap rather than on the
  // round trip. Keyed the way the loader keys it.
  const [marks, setMarks] = useState<Record<string, boolean>>({});
  const [follow, setFollow] = useState<null | "following" | "requested" | "off">(null);
  const [followBusy, setFollowBusy] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    personPeek(id).then((res) => {
      if (!res) {
        setMissing(true);
        return;
      }
      setPeek(res);
      setFollow(res.following ? "following" : "off");
    });
  }, [id]);

  const save = (classId: string, iso: string, on: boolean) => {
    const key = `${classId}|${iso}`;
    setMarks((m) => ({ ...m, [key]: on }));
    startTransition(async () => {
      const res = await setGoing(classId, iso, on);
      // Put it back if the server disagreed. No toast: the sheet is still
      // open and the ribbon flipping back is the message.
      if (!res.ok) setMarks((m) => ({ ...m, [key]: !on }));
      else if (on) announceSaved(classId, iso);
    });
  };

  const toggleFollow = async () => {
    if (!peek?.handle || followBusy || follow === null) return;
    setFollowBusy(true);
    const { followTrainer, unfollowTrainer } = await import("@/app/actions/subscribe");
    if (follow === "off") {
      const res = await followTrainer(peek.handle);
      if (res.ok) setFollow(res.requested ? "requested" : "following");
    } else {
      // Unfollow also withdraws a pending ask, so Requested is the cancel.
      const res = await unfollowTrainer(peek.handle);
      if (res.ok) setFollow("off");
    }
    setFollowBusy(false);
  };

  const visibleDays = peek
    ? peek.days
        .map((day) => ({
          ...day,
          items: scheduleOnly ? day.items.filter((item) => item.coaching) : day.items,
        }))
        .filter((day) => day.items.length > 0)
    : [];

  return (
    <div
      className="sheet-scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet sheet-full peeksheet">
        {/* A direct child of the scrolling sheet so sticky can hold it for
            the full week. Inside the short header it was constrained to the
            header and disappeared as soon as the dates began. */}
        <button className="iconbtn sheetclose peekclose" aria-label="Close" onClick={onClose}>
          <Icon name="close" size={18} />
        </button>
        {/* The head stacks, by Matt's call: close alone in the corner, then
            the face, the name on its own line under it, and two actions
            below. Your own sheet swaps Follow for Share your week. */}
        <div className="peekhead peekhead-stack">
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
          <h2 className="peekhead-nm">{name}</h2>
          {peek?.handle && (
            <div className="peekacts">
              <Link className="peekfollow peekview" href={`/${peek.handle}`}>
                View profile
              </Link>
              {self && shareHref ? (
                <Link className="peekfollow on" href={shareHref}>
                  Share your week
                </Link>
              ) : follow !== null ? (
                <button
                  className={`peekfollow${follow !== "off" ? " on" : ""}`}
                  aria-pressed={follow !== "off"}
                  disabled={followBusy}
                  onClick={toggleFollow}
                >
                  {follow === "following"
                    ? "Following"
                    : follow === "requested"
                      ? "Requested"
                      : "Follow"}
                </button>
              ) : null}
            </div>
          )}
        </div>

        {missing && <p className="peekempty">That schedule isn&rsquo;t available.</p>}

        {peek && !visibleDays.length && (
          <p className="peekempty">
            {peek.gated
              ? `Follow ${name} to see their week.`
              : `${name} has nothing up for the next couple of weeks. Their circle lights up when they do.`}
          </p>
        )}

        {visibleDays.map((d) => (
          <div key={d.iso} className="peekday">
            <p className="peekday-h">{d.label}</p>
            {d.items.map((it) => {
              const key = `${it.classId}|${it.iso}`;
              const on = marks[key] ?? it.saved;
              // A class opens as a sheet from a list and as a page from a
              // link, and a peek is a list. Left as a bare href the row
              // navigated, which threw the peek away.
              const row = (
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
                        <span className="peekrow-ap">{it.ap.toLowerCase()}</span>
                        {it.where ? ` · ${it.where}` : ""}
                      </span>
                      {!self && on && (
                        <span className="peekrow-tags">
                          <span className="peektag peektag-you">In your week too</span>
                        </span>
                      )}
                    </Link>
                    {!self && !scheduleOnly && (
                      <button
                        className={`peekadd${on ? " on" : ""}`}
                        onClick={() => save(it.classId, it.iso, !on)}
                        aria-label={on ? `Added to your week: ${it.name}` : `Add ${it.name} to your week`}
                      >
                        <Icon name={on ? "check_circle" : "add_circle"} size={22} />
                        <span>{on ? "Added" : "Add"}</span>
                      </button>
                    )}
                  </div>
                </ClassOpener>
              );
              if (self || scheduleOnly) return <div key={key}>{row}</div>;
              return (
                // Saving belongs to somebody else's week. Your own peek is
                // already the destination, so it carries neither swipe nor
                // a second Save action.
                <SwipeGoing key={key} going={on} onToggle={() => save(it.classId, it.iso, !on)}>
                  {row}
                </SwipeGoing>
              );
            })}
          </div>
        ))}

        {!self && !scheduleOnly && peek && visibleDays.length > 0 && (
          <p className="peekfoot">Add anything here to put it on your own week.</p>
        )}
      </div>
    </div>
  );
}

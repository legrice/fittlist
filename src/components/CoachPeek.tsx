"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { personPeek, type Peek } from "@/app/actions/peek";
import { setGoing } from "@/app/actions/going";
import { ClassOpener } from "@/components/ClassOpener";
import { Icon } from "@/components/Icon";
import { MessageComposer } from "@/components/MessageComposer";
import { SwipeGoing } from "@/components/SwipeGoing";
import { CalendarList, type WeekDayRows } from "@/components/WeekView";
import { initialOf } from "@/lib/avatar";
import { announceSaved } from "@/components/SaveEducation";
import { Toast, useToast } from "@/components/Toast";

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
  onShare,
  onPinChange,
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
  onShare?: () => void;
  /** Lets a parent rail discard any old priority state after an unfollow. */
  onPinChange?: (pinned: boolean) => void;
  onClose: () => void;
}) {
  const [peek, setPeek] = useState<Peek | null>(null);
  const [missing, setMissing] = useState(false);
  // The mark, locally, so the ribbon fills on the tap rather than on the
  // round trip. Keyed the way the loader keys it.
  const [marks, setMarks] = useState<Record<string, boolean>>({});
  const [messageOpen, setMessageOpen] = useState(false);
  const [relationship, setRelationship] = useState<"off" | "following" | "requested" | null>(null);
  const [, startTransition] = useTransition();
  const [followPending, startFollowTransition] = useTransition();
  const [toastMsg, toastOn, , dismissToast, toastFor] = useToast();

  useEffect(() => {
    personPeek(id).then((res) => {
      if (!res) {
        setMissing(true);
        return;
      }
      setPeek(res);
      setRelationship(res.following ? "following" : "off");
    });
  }, [id]);

  const toggleFollow = () => {
    if (!peek?.handle || relationship === null || followPending) return;
    const before = relationship;
    const next = before === "off" ? "following" : "off";
    setRelationship(next);
    startFollowTransition(async () => {
      const { followTrainer, unfollowTrainer } = await import("@/app/actions/subscribe");
      const result = before === "off" ? await followTrainer(peek.handle!) : await unfollowTrainer(peek.handle!);
      if (!result.ok) {
        setRelationship(before);
        return;
      }
      if (before === "off") {
        const requested = "requested" in result && !!result.requested;
        setRelationship(requested ? "requested" : "following");
        toastFor(requested ? `Requested to follow ${name}.` : `Following ${name}.`, 3600);
      } else {
        setRelationship("off");
        onPinChange?.(false);
        window.dispatchEvent(new Event("calendar-pins-changed"));
        toastFor(`Unfollowed ${name}.`, 3600);
      }
    });
  };

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

  const visibleDays = peek
    ? peek.days
        .map((day) => ({
          ...day,
          items: scheduleOnly ? day.items.filter((item) => item.coaching) : day.items,
        }))
        .filter((day) => day.items.length > 0)
    : [];
  const listDays: WeekDayRows[] = visibleDays.map((day) => ({
    iso: day.iso,
    label: day.label,
    rows: day.items.map((item) => {
      const key = `${item.classId}|${item.iso}`;
      const on = marks[key] ?? item.saved;
      const corner = !self && !scheduleOnly ? (
        <button
          className={`calendar-save-action following-add${on ? " on" : ""}`}
          onClick={() => save(item.classId, item.iso, !on)}
          aria-label={on ? `Saved to your week: ${item.name}` : `Save ${item.name} to your week`}
        >
          <Icon name={on ? "bookmark_added" : "bookmark"} size={24} />
        </button>
      ) : undefined;
      return {
        key,
        name: item.name,
        where: item.where,
        hm: item.hm,
        ap: item.ap,
        dur: `${item.durationMin} min`,
        coach: { id, name, color, photo },
        hideCoachAvatar: true,
        href: `/${item.base}/${item.classId}?d=${item.iso}`,
        classId: item.classId,
        iso: item.iso,
        base: item.base,
        tag: !self && on ? "In your week too" : undefined,
        corner,
        wrap: !self && !scheduleOnly
          ? (row) => (
              <SwipeGoing going={on} onToggle={() => save(item.classId, item.iso, !on)}>
                {row}
              </SwipeGoing>
            )
          : undefined,
      };
    }),
  }));

  return (
    <div
      className="sheet-scrim peek-scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="sheet sheet-full peeksheet"
        role="dialog"
        aria-modal="true"
        aria-label={`${name} calendar`}
      >
        {/* A direct child of the scrolling sheet so sticky can hold it for
            the full week. Inside the short header it was constrained to the
            header and disappeared as soon as the dates began. */}
        <div className="peekcontrols">
          <button className="iconbtn sheetclose peekclose" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
          {!self && relationship !== null && <button className={`peekfollow peekrelationship${relationship !== "off" ? " on" : ""}`} type="button" disabled={followPending} aria-label={relationship === "following" ? `Unfollow ${name}` : relationship === "requested" ? `Cancel follow request for ${name}` : `Follow ${name}`} aria-pressed={relationship !== "off"} onClick={toggleFollow}>{relationship === "following" ? "Following" : relationship === "requested" ? "Requested" : "Follow"}</button>}
        </div>
        {/* Identity stays compact: face beside the name, then the person's
            role and location underneath. Actions remain on their own row. */}
        <div className="peekhead peekhead-stack">
          <div className="peekidentity">
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
              {peek && (
                <p className="peekhead-meta">
                  {peek.personType}{peek.location ? ` · ${peek.location}` : ""}
                </p>
              )}
            </div>
          </div>
          {peek?.handle && (
            <div className="peekacts">
              {self && shareHref ? (
                <Link className="peekfollow peekaction" href={`/${peek.handle}`}>
                  <Icon name="account_circle" size={18} />
                  <span>View profile</span>
                </Link>
              ) : (
                <>
                  {peek.messagesOpen && <button className="peekfollow peekaction" type="button" onClick={() => setMessageOpen(true)}><Icon name="chat" size={18} /><span>Message</span></button>}
                  <Link className="peekfollow peekaction" href={`/${peek.handle}`}><Icon name="account_circle" size={18} /><span>View profile</span></Link>
                </>
              )}
            </div>
          )}
        </div>

        {missing && <p className="peekempty">That schedule isn&rsquo;t available.</p>}

        {peek && !visibleDays.length && (
          <p className="peekempty">
            {peek.gated
              ? `Save ${name}'s calendar to see their week.`
              : `${name} has nothing up for the next couple of weeks. Their circle lights up when they do.`}
          </p>
        )}

        {listDays.length > 0 && (
          <ClassOpener handle="">
            <CalendarList days={listDays} />
          </ClassOpener>
        )}

        {!self && !scheduleOnly && peek && visibleDays.length > 0 && (
          <p className="peekfoot">Add anything here to put it on your own week.</p>
        )}
        {self && shareHref && (
          <div className="peek-share-sticky">
            <Link className="peek-share-cta" href={shareHref} onClick={onShare}>
              <Icon name="reply" className="share-arrow-forward" size={21} />
              <span>Share your week</span>
            </Link>
          </div>
        )}
      </div>
      {messageOpen && peek?.handle && (
        <div className="sheet-scrim" onClick={(event) => { if (event.target === event.currentTarget) setMessageOpen(false); }}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label={`Message ${name}`}>
            <button className="iconbtn sheetclose" aria-label="Close" onClick={() => setMessageOpen(false)}><Icon name="close" size={18} /></button>
            <h2>Message {name.split(/\s+/)[0]}</h2>
            <MessageComposer handle={peek.handle} coachName={name} signedIn />
          </div>
        </div>
      )}
      <Toast msg={toastMsg} on={toastOn} dismiss={{ label: "Great, thanks", onClick: dismissToast }} />
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { personPeek, type Peek } from "@/app/actions/peek";
import { toggleCalendarPin } from "@/app/actions/pins";
import { ClassOpener } from "@/components/ClassOpener";
import { Icon } from "@/components/Icon";
import { MessageComposer } from "@/components/MessageComposer";
import { CalendarList, type WeekDayRows } from "@/components/WeekView";
import { initialOf } from "@/lib/avatar";
import { Toast, useToast } from "@/components/Toast";

/**
 * One person's week, opened from their circle.
 *
 * Everything they coach plus everything they saved, in time order, as a
 * live calendar rather than an image: the same rows as anywhere else. Classes
 * they lead carry a Coaching tag, which is the
 * only place in the app where coach and member differ. Anything you have
 * also saved is marked "In your week too": the overlap marker is the
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
  pinned: initialPinned = false,
  onPinChange,
  onClose,
}: {
  id: string;
  /** Passed in from the circle rather than waited for: the sheet names whose
   *  week it is on the first frame, and the list arrives under it. */
  name: string;
  photo: string | null;
  color: string;
  /** Your own face uses this same week sheet without follow controls. */
  self?: boolean;
  /** Following is about a coach's published schedule, not classes they have
   * privately added for themselves. */
  scheduleOnly?: boolean;
  /** Explicit favorite state, separate from following. */
  pinned?: boolean;
  onPinChange?: (pinned: boolean) => void;
  onClose: () => void;
}) {
  const [peek, setPeek] = useState<Peek | null>(null);
  const [missing, setMissing] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [relationship, setRelationship] = useState<"off" | "following" | "requested" | null>(null);
  const [pinned, setPinned] = useState(initialPinned);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ y: 0, at: 0 });
  const sheetRef = useRef<HTMLDivElement>(null);
  const [followPending, startFollowTransition] = useTransition();
  const [pinPending, startPinTransition] = useTransition();
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

  useEffect(() => setPinned(initialPinned), [initialPinned]);

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

  const togglePin = () => {
    if (pinPending) return;
    const before = pinned;
    setPinned(!before);
    onPinChange?.(!before);
    startPinTransition(async () => {
      const result = await toggleCalendarPin("person", id);
      if (!result.ok) {
        setPinned(before);
        onPinChange?.(before);
        return;
      }
      setPinned(result.pinned);
      onPinChange?.(result.pinned);
      window.dispatchEvent(new Event("calendar-pins-changed"));
    });
  };

  const finishDrag = (clientY: number) => {
    const distance = Math.max(0, clientY - dragStart.current.y);
    const velocity = distance / Math.max(1, performance.now() - dragStart.current.at);
    setDragging(false);
    if (distance > 120 || velocity > 0.65) {
      setDragY(window.innerHeight);
      window.setTimeout(onClose, 180);
    } else setDragY(0);
  };

  // iOS Safari does not reliably deliver Pointer Events from a sticky drag
  // handle inside a scrolling sheet. Listen for native touches on the whole
  // sheet so a downward pull works anywhere while its scroll is at the top.
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    let startY = 0;
    let startedAt = 0;
    let distance = 0;
    let active = false;
    const onTouchStart = (event: TouchEvent) => {
      if (sheet.scrollTop > 0) return;
      startY = event.touches[0].clientY;
      startedAt = performance.now();
      distance = 0;
      active = true;
    };
    const onTouchMove = (event: TouchEvent) => {
      if (!active) return;
      distance = event.touches[0].clientY - startY;
      if (distance <= 10 || sheet.scrollTop > 0) {
        setDragY(0);
        return;
      }
      event.preventDefault();
      setDragging(true);
      setDragY(distance - 10);
    };
    const onTouchEnd = () => {
      if (!active) return;
      active = false;
      const velocity = distance / Math.max(1, performance.now() - startedAt);
      setDragging(false);
      if (distance > 120 || velocity > 0.65) {
        setDragY(window.innerHeight);
        window.setTimeout(onClose, 180);
      } else setDragY(0);
    };
    sheet.addEventListener("touchstart", onTouchStart, { passive: true });
    sheet.addEventListener("touchmove", onTouchMove, { passive: false });
    sheet.addEventListener("touchend", onTouchEnd);
    sheet.addEventListener("touchcancel", onTouchEnd);
    return () => {
      sheet.removeEventListener("touchstart", onTouchStart);
      sheet.removeEventListener("touchmove", onTouchMove);
      sheet.removeEventListener("touchend", onTouchEnd);
      sheet.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [onClose]);

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
        tag: !self && item.saved ? "In your week too" : undefined,
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
        ref={sheetRef}
        className={`sheet sheet-full peeksheet${dragging ? " is-dragging" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={`${name} calendar`}
        style={{ transform: `translateY(${dragY}px)` }}
      >
        {/* A direct child of the scrolling sheet so sticky can hold it for
            the full week. Inside the short header it was constrained to the
            header and disappeared as soon as the dates began. */}
        <div className="peekcontrols">
          <button className="iconbtn sheetclose peekclose" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
          {!self && relationship !== null && <button className={`iconbtn peekpin${pinned ? " on" : ""}`} type="button" disabled={pinPending} aria-label={pinned ? `Remove ${name} from favorites` : `Add ${name} to favorites`} aria-pressed={pinned} onClick={togglePin}><Icon name={pinned ? "star_filled" : "star"} size={21} /></button>}
        </div>
        {!peek && !missing && (
          <div className="peekloading" role="status" aria-live="polite" aria-busy="true">
            <span aria-hidden="true" />
            <p>Loading schedule</p>
          </div>
        )}
        {missing && <p className="peekempty">That schedule isn&rsquo;t available.</p>}

        {/* Identity stays compact: face beside the name, then the person's
            role and location underneath. Actions remain on their own row. */}
        {peek && <>
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
              <p className="peekhead-meta">
                {peek.personType}{peek.location ? ` · ${peek.location}` : ""}
              </p>
            </div>
          </div>
          {peek?.handle && (
            <div className="peekacts">
              {self ? (
                <>
                  <Link className="peekfollow peekaction" href={`/${peek.handle}`}>
                    <Icon name="account_circle" size={18} />
                    <span>View profile</span>
                  </Link>
                  <Link className="peekfollow peekaction peekaction-manage" href="/calendar">
                    <Icon name="calendar_month" size={18} />
                    <span>Manage calendar</span>
                  </Link>
                </>
              ) : (
                <>
                  {relationship !== null && <button className={`peekfollow peekaction peekrelationship${relationship !== "off" ? " on" : ""}`} type="button" disabled={followPending} aria-label={relationship === "following" ? `Unfollow ${name}` : relationship === "requested" ? `Cancel follow request for ${name}` : `Follow ${name}`} aria-pressed={relationship !== "off"} onClick={toggleFollow}>{relationship === "following" ? "Following" : relationship === "requested" ? "Requested" : "Follow"}</button>}
                  {peek.messagesOpen && <button className="peekfollow peekaction" type="button" onClick={() => setMessageOpen(true)}><Icon name="chat" size={18} /><span>Message</span></button>}
                  <Link className="peekfollow peekaction" href={`/${peek.handle}`}><Icon name="account_circle" size={18} /><span>View profile</span></Link>
                </>
              )}
            </div>
          )}
          </div>

        {!visibleDays.length && (
          <p className="peekempty">
            {peek.gated
              ? `Save ${name}'s calendar to see their week.`
              : `${name} has nothing up for the next couple of weeks. Their circle lights up when they do.`}
          </p>
        )}

        {listDays.length > 0 && (
          <ClassOpener handle="">
            <CalendarList days={listDays} className="profile-calendar-list" />
          </ClassOpener>
        )}

        {!self && !scheduleOnly && visibleDays.length > 0 && (
          <p className="peekfoot">Add anything here to put it on your own week.</p>
        )}
        </>}
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

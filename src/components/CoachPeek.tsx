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
import {
  invalidateClientMemory,
  loadClientMemory,
  readClientMemory,
  writeClientMemory,
} from "@/lib/client-memory";

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
  const memoryKey = `person-calendar:${id}`;
  const rememberedPeek = readClientMemory<Peek>(memoryKey);
  const [peek, setPeek] = useState<Peek | null>(rememberedPeek);
  const [missing, setMissing] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [relationship, setRelationship] = useState<"off" | "following" | "requested" | null>(rememberedPeek ? (rememberedPeek.following ? "following" : "off") : null);
  const [pinned, setPinned] = useState(initialPinned);
  const [visible, setVisible] = useState(false);
  const historyMarker = useRef(`person-profile-${Math.random().toString(36).slice(2)}`);
  const originScrollY = useRef(0);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeRef = useRef(onClose);
  const [followPending, startFollowTransition] = useTransition();
  const [pinPending, startPinTransition] = useTransition();
  const [toastMsg, toastOn, , dismissToast, toastFor] = useToast();

  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  const beginClose = () => {
    setVisible(false);
    if (exitTimer.current) clearTimeout(exitTimer.current);
    exitTimer.current = setTimeout(() => {
      closeRef.current();
      window.requestAnimationFrame(() => window.scrollTo(0, originScrollY.current));
    }, 240);
  };
  const goBack = () => {
    if (window.history.state?.personProfileTakeover === historyMarker.current) window.history.back();
    else beginClose();
  };

  useEffect(() => {
    originScrollY.current = window.scrollY;
    const previousOverflow = document.body.style.overflow;
    window.history.pushState({ ...(window.history.state ?? {}), personProfileTakeover:historyMarker.current }, "", window.location.href);
    const enterFrame = window.requestAnimationFrame(() => setVisible(true));
    const closeOnPop = () => beginClose();
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") goBack(); };
    document.body.style.overflow = "hidden";
    window.addEventListener("popstate", closeOnPop);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.cancelAnimationFrame(enterFrame);
      if (exitTimer.current) clearTimeout(exitTimer.current);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("popstate", closeOnPop);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  useEffect(() => {
    loadClientMemory(memoryKey, () => personPeek(id)).then((res) => {
      if (!res) {
        invalidateClientMemory(memoryKey);
        setPeek(null);
        setRelationship(null);
        setMissing(true);
        return;
      }
      setPeek(res);
      setMissing(false);
      setRelationship(res.following ? "following" : "off");
    });
  }, [id, memoryKey]);

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
        const settled = requested ? "requested" : "following";
        setRelationship(settled);
        if (peek) writeClientMemory(memoryKey, { ...peek, following: !requested });
        toastFor(requested ? `Requested to follow ${name}.` : `Following ${name}.`, 3600);
      } else {
        setRelationship("off");
        if (peek) writeClientMemory(memoryKey, { ...peek, following: false });
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
    >
      <div
        className={`sheet sheet-full peeksheet${visible ? " is-open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={`${name} calendar`}
      >
        {/* A direct child of the scrolling sheet so sticky can hold it for
            the full week. Inside the short header it was constrained to the
            header and disappeared as soon as the dates began. */}
        <div className="peekcontrols">
          <button className="iconbtn sheetclose peekclose" aria-label="Back" onClick={goBack}>
            <Icon name="arrow_back" size={21} />
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
            <button className="iconbtn sheetclose sheet-dismiss" aria-label="Close" onClick={() => setMessageOpen(false)}><Icon name="close" size={20} /></button>
            <h2>Message {name.split(/\s+/)[0]}</h2>
            <MessageComposer handle={peek.handle} coachName={name} signedIn />
          </div>
        </div>
      )}
      <Toast msg={toastMsg} on={toastOn} dismiss={{ label: "Great, thanks", onClick: dismissToast }} />
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteClass } from "@/app/actions/classes";
import { classDetail, type ClassDetail } from "@/app/actions/classdetail";
import { setGoing } from "@/app/actions/going";
import { giveUpShift, sendShiftTo } from "@/app/actions/gym";
import { Icon } from "@/components/Icon";

/**
 * A class, tapped.
 *
 * One sheet, two readings. Your own class offers Edit, Cancel this date, and
 * the quiet way to take the whole thing off your week. Somebody else's offers
 * the picture and the way to their week. Nothing offers "add to my calendar",
 * because a member has no calendar to add it to any more: they read the week
 * of the people they follow, and that is the whole relationship.
 *
 * The old class sheet was a full-screen overlay with a photograph, a
 * description, booking links, a Going pill, the coach's roster and an admin
 * photo tool behind a menu. It answered every question anybody had ever had
 * about a class. This answers the three somebody actually taps for: when,
 * where, and whose. The class page at /{handle}/{classId} still wears the old
 * overlay for a link somebody was sent; reconciling the two is its own commit
 * and it should end with this one winning.
 */
export type PeekClass = {
  id: string;
  iso: string;
  name: string;
  /** "Wed, Aug 5". A fact about the class like the others, so it reads in the
   *  same title case they do rather than as a tracked eyebrow. */
  when: string;
  time: string;
  studio: string | null;
  /** The studio's page, when it has one. The name is a door rather than a
   *  fact: somebody checking where a class is is one tap from wanting to know
   *  what the place is. */
  studioHref?: string | null;
  /** Absent on your own class: the sheet you are looking at is yours. It
   *  carries a face because it is a by-line now rather than a row in the
   *  facts, and a by-line without a face is a name in a list. */
  coach?: {
    name: string;
    handle: string | null;
    photo?: string | null;
    color?: string;
    /** Whether the viewer already favorited them, when the caller knows:
     *  set at all is what draws the star. A class is how you discover a
     *  coach, so the peek is where the relationship starts. */
    favorited?: boolean;
  } | null;
  /** Where the fuller detail is loaded from: a handle, or `s/{slug}` for a
   *  gym's class. Without it the sheet stays a summary, which is all a row
   *  built from a calendar the viewer already owns needs. */
  base?: string;
  /** Your own class only. */
  repeats?: string | null;
  /** The depth the row already knows, painted on the first frame so the
   *  sheet opens at its full height instead of growing when the fetch
   *  lands: the About text arriving late bumped the sheet after it was
   *  up. The fetch still runs (the photo and the rota live there); these
   *  just stop the jump. */
  preview?: {
    description?: string | null;
    classType?: string | null;
    links?: { label: string; url: string }[];
    studioAddress?: string | null;
  };
  /**
   * A gym's class that you are on the rota for.
   *
   * It is on your calendar and it is not yours: the studio owns it, so Edit,
   * Cancel and Delete are all wrong here and two of them would have failed
   * loudly. What a coach can do with a date they are on is give it up or hand
   * it to somebody, which is what Manage offers.
   */
  shift?: boolean;
  mine: boolean;
};

/** The by-line: their face and their name, and a door to their week when they
 *  have a page. A coach with no handle is a gym's account, which is a place
 *  rather than a person and has nothing to open. */
function CoachBy({ coach }: { coach: NonNullable<PeekClass["coach"]> }) {
  const face = (
    <>
      <span className="clspeek-by-av" style={{ background: coach.color ?? "var(--cl)" }}>
        {coach.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coach.photo} alt="" />
        ) : (
          (coach.name.trim().charAt(0) || "?").toUpperCase()
        )}
      </span>
      <span className="clspeek-by-nm">{coach.name}</span>
    </>
  );
  if (!coach.handle) return <span className="clspeek-by">{face}</span>;
  return (
    <a className="clspeek-by" href={`/${coach.handle}`}>
      {face}
      <Icon name="chevron_right" size={18} />
    </a>
  );
}

export function ClassPeek({
  cls,
  onClose,
  onEdit,
  onShare,
  onChanged,
  onToast,
}: {
  cls: PeekClass;
  onClose: () => void;
  /** Your own class: open the editor on it. */
  onEdit?: () => void;
  /** Somebody else's: hand the picture on. */
  onShare?: () => void;
  onChanged: () => void;
  onToast: (msg: string, hlKey?: string) => void;
}) {
  const router = useRouter();
  const sheetRef = useRef<HTMLDivElement>(null);
  const [confirm, setConfirm] = useState<"occurrence" | "all" | null>(null);
  const [pending, start] = useTransition();
  // The depth, loaded only when somebody asks for it. Most taps are somebody
  // checking a time, and a photograph and a description are a lot to send for
  // that; this way the sheet is instant and the detail is one tap behind it.
  const [full, setFull] = useState<ClassDetail | null>(null);
  const [loading, setLoading] = useState(false);
  // The viewer's mark, locally, so the button flips on the tap rather than
  // the round trip. Null until touched; the loaded detail is the truth
  // before that.
  const [savedNow, setSavedNow] = useState<boolean | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  // The overflow behind the top-left dots: Share, and whatever joins it.
  const [more, setMore] = useState(false);

  // The rota's own controls, loaded from the same place the depth is: whether
  // this date can be given up, and who it can be handed to, are the gym's
  // answers rather than anything a calendar row knows.
  const [manage, setManage] = useState<ClassDetail["shift"] | null>(null);
  const [sending, setSending] = useState(false);
  const [shiftErr, setShiftErr] = useState("");

  // The base is an address ("s/{slug}" for a gym's class); classDetail wants
  // the bare key it looks the owner up by. Conflating those two is how a
  // shift's sheet loaded nothing: the lookup ran on "s/ironbound" and found
  // neither a handle nor a slug.
  const detailKey = cls.base?.replace(/^s\//, "");

  const openManage = () => {
    if (loading || !detailKey) return;
    setLoading(true);
    classDetail(detailKey, cls.id, cls.iso)
      // A shift with no rota block back means the gym has nothing to offer on
      // this date; the sheet still opens, with give-up as the one thing left.
      .then((d) => setManage(d?.shift ?? { onName: "", canGiveUp: true, canClaim: false, sendable: [] }))
      .finally(() => setLoading(false));
  };

  const runShift = (what: "give" | "send", toUserId?: string) =>
    start(async () => {
      setShiftErr("");
      const res =
        what === "give"
          ? await giveUpShift(cls.id, cls.iso)
          : await sendShiftTo(cls.id, cls.iso, toUserId!);
      if (!res.ok) {
        setShiftErr(res.error ?? "Something went wrong");
        return;
      }
      onToast(
        what === "give"
          ? "Given up. The gym knows, and so does everyone who coaches there."
          : "pending" in res && res.pending
            ? "Sent. The studio has to approve it."
            : "Handed on. They have been told.",
      );
      setSending(false);
      setManage(null);
      onClose();
      onChanged();
      router.refresh();
    });

  // The drawer pull works everywhere, not only on the handle: a downward
  // drag anywhere on the sheet (with its own scroll at the top) follows the
  // finger, and past a palm's width it lets go. Native listeners, because
  // React's touchmove is passive and cannot preventDefault the scroll.
  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return undefined;
    let startY = 0;
    let dy = 0;
    let dragging = false;
    const onStart = (e: TouchEvent) => {
      if (el.scrollTop > 0) return;
      startY = e.touches[0].clientY;
      dy = 0;
      dragging = true;
      el.style.transition = "none";
    };
    const onMove = (e: TouchEvent) => {
      if (!dragging) return;
      dy = e.touches[0].clientY - startY;
      // A tap wobbles by a few pixels. The drag only takes over past a slop,
      // because preventDefault on the first wobble also swallows the click,
      // and every button in the sheet went dead to a slightly-moving thumb.
      if (dy <= 10 || el.scrollTop > 0) {
        el.style.transform = "";
        return;
      }
      e.preventDefault();
      el.style.transform = `translateY(${dy - 10}px)`;
    };
    const onEnd = () => {
      if (!dragging) return;
      dragging = false;
      el.style.transition = "transform .22s ease";
      if (dy > 110) {
        el.style.transform = "translateY(110%)";
        setTimeout(onClose, 180);
      } else {
        el.style.transform = "";
      }
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The depth loads the moment the sheet opens: this is the classic viewer
  // again, by Matt's call, so the photograph, the kicker, the address and the
  // booking door are the sheet rather than a second tap behind it. The
  // summary fields paint instantly from the row while it arrives.
  useEffect(() => {
    if (!detailKey) return undefined;
    let live = true;
    setLoading(true);
    classDetail(detailKey, cls.id, cls.iso)
      .then((d) => live && setFull(d))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cls.id, cls.iso, cls.base]);

  // Hand the picture on: the caller's sheet when it has one, the native
  // share pointed at the class page when it doesn't, and the clipboard when
  // the tray is missing or refuses. Every path ends in the tray or a toast;
  // a share button that can silently do nothing reads as broken.
  const share = async () => {
    if (onShare) return onShare();
    const url = full?.shareUrl;
    if (!url) {
      onToast(loading ? "Still loading, try again" : "Couldn't share that");
      return;
    }
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ url });
        return;
      }
    } catch (e) {
      // Dismissing the tray is a decision, not a failure.
      if ((e as DOMException)?.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(url);
      onToast("Link copied, ready to paste");
    } catch {
      onToast("Couldn't share that");
    }
  };
  // The row's carried depth paints first and the fetch confirms it: the
  // sheet must not grow a paragraph after it is already up.
  const description = full?.description ?? cls.preview?.description ?? null;
  const classType = full?.classType ?? cls.preview?.classType ?? null;
  const bookLinks = !cls.mine ? (full?.links ?? cls.preview?.links ?? []) : [];
  const [bookOpen, setBookOpen] = useState(false);

  const run = (scope: "occurrence" | "all") =>
    start(async () => {
      const res = await deleteClass(cls.id, scope, cls.iso);
      if (!res.ok) {
        onToast(res.error ?? "Something went wrong");
        return;
      }
      onToast(scope === "occurrence" ? "Cancelled, and everyone following knows" : "Off your week");
      setConfirm(null);
      onClose();
      onChanged();
      router.refresh();
    });

  return (
    <div
      className="sheet-scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
    >
      <div className="sheet clspeek clsfull" ref={sheetRef}>
        {/* The close first, sticky in the corner: it rode the photograph
            away on a scroll, and the one way off a sheet has to stay under
            the thumb the whole way down. The photograph follows, running to
            the sheet's own top edge, and slides under the circle. */}
        {/* The corners: the overflow left, close right, one sticky row, by
            Matt's call. Share lives behind the dots now rather than in the
            footer, which belongs to the acts (Save, Book). */}
        <div className="clsfull-toprow">
          <button className="clspeek-x clsfull-more" aria-label="More" onClick={() => setMore(true)}>
            <Icon name="more_horiz" size={20} />
          </button>
          <button className="clspeek-x clsfull-x" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={20} />
          </button>
        </div>
        {full?.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="clsfull-photo" src={full.image} alt="" />
        )}
        {!full?.image && <span className="clspeek-grab" aria-hidden="true" />}

        {classType && <p className="clsfull-kick">{classType}</p>}
        <h2 className="clspeek-nm">{cls.name}</h2>
        {cls.coach && (
          <span className="clspeek-byrow">
            <CoachBy coach={cls.coach} />
          </span>
        )}

        {/* The facts, the classic way: a glyph, the fact, its detail under
            it. The date leads because which day is the first thing checked. */}
        <div className="clsfull-facts">
          <div className="clsfull-fact">
            <span className="clsfull-ic" aria-hidden="true">
              <Icon name="calendar_today" size={22} />
            </span>
            <span className="clsfull-txt">
              <span className="t">{full?.dateLong ?? cls.when}</span>
              <span className="s">
                {full ? `${full.time} · ${full.durationMin} min` : cls.time}
              </span>
            </span>
          </div>
          {cls.studio && (
            <div className="clsfull-fact">
              <span className="clsfull-ic" aria-hidden="true">
                <Icon name="place" size={22} />
              </span>
              <span className="clsfull-txt">
                {cls.studioHref ? (
                  <a className="clspeek-door" href={cls.studioHref}>
                    <span className="t">{cls.studio}</span>
                    <Icon name="chevron_right" size={19} />
                  </a>
                ) : (
                  <span className="t">{cls.studio}</span>
                )}
                {(full?.studioAddress ?? cls.preview?.studioAddress) && (
                  <span className="s">{full?.studioAddress ?? cls.preview?.studioAddress}</span>
                )}
              </span>
            </div>
          )}
          {cls.mine && cls.repeats && (
            <div className="clsfull-fact">
              <span className="clsfull-ic" aria-hidden="true">
                <Icon name="event" size={22} />
              </span>
              <span className="clsfull-txt">
                <span className="t">Repeats</span>
                <span className="s">{cls.repeats}</span>
              </span>
            </div>
          )}
        </div>

        {description && (
          <div className="clsfull-about">
            <h3>About</h3>
            <p>{description}</p>
          </div>
        )}

        {/* Your own class keeps its working controls above the footer: they
            are about changing the thing, where the footer is about handing
            it on. A shift's one control rides the footer instead, beside
            Share, because give-up and transfer are what the footer's slot
            means on a date that is yours to manage rather than book. */}
        {cls.mine && !cls.shift && (
          <>
            <div className="clspeek-cta">
              <button className="clspeek-btn ghost" onClick={onEdit}>
                Edit
              </button>
              <button className="clspeek-btn ghost" onClick={() => setConfirm("occurrence")}>
                Cancel this date
              </button>
            </div>
            <button className="clspeek-del" onClick={() => setConfirm("all")}>
              Delete from my week
            </button>
          </>
        )}

        {/* RSVP says where the name goes before the tap, never after. */}
        {full?.canAdd && full.rsvp && (
          <p className="clspeek-rsvpnote">Your name goes to whoever runs it when you RSVP.</p>
        )}

        {/* The footer, pinned to the sheet's bottom edge: the acts only.
            Save (or RSVP) in the going green when the class can be saved,
            Book when it has a booking door; Share moved behind the dots. */}
        <div className="clsfull-cta">
          {cls.mine && cls.shift && (
            <button className="clsfull-btn manage" onClick={openManage}>
              {loading ? "Opening…" : "Manage shift"}
            </button>
          )}
          {full?.canAdd &&
            (() => {
              const on = savedNow ?? full.added;
              const word = full.rsvp ? (on ? "RSVP’d" : "RSVP") : on ? "Saved" : "Save";
              return (
                <button
                  className={`clsfull-btn save${on ? " on" : ""}`}
                  disabled={saveBusy}
                  onClick={async () => {
                    if (saveBusy) return;
                    setSaveBusy(true);
                    setSavedNow(!on);
                    const res = await setGoing(cls.id, cls.iso, !on);
                    if (!res.ok) setSavedNow(on);
                    else if (!on)
                      onToast(
                        full.rsvp
                          ? "RSVP’d. It’s on your calendar."
                          : "Saved to your calendar",
                        `${cls.id}.${cls.iso}`,
                      );
                    setSaveBusy(false);
                    onChanged();
                  }}
                >
                  {word}
                </button>
              );
            })()}
          {bookLinks.length > 0 && (
            <button className="clsfull-btn book" onClick={() => setBookOpen(true)}>
              Book
            </button>
          )}
        </div>
      </div>

      {/* The overflow, behind the top-left dots: Share for now, and the
          slot every future one-off action goes in rather than the footer. */}
      {more && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            e.stopPropagation();
            if (e.target === e.currentTarget) setMore(false);
          }}
        >
          <div className="sheet clspeek">
            <span className="clspeek-grab" aria-hidden="true" />
            <div className="clspeek-head">
              <div className="clspeek-titles">
                <h2 className="clspeek-nm">{cls.name}</h2>
              </div>
              <button className="clspeek-x" aria-label="Close" onClick={() => setMore(false)}>
                <Icon name="close" size={20} />
              </button>
            </div>
            <div className="settingslist">
              <button
                className="setrow"
                onClick={() => {
                  setMore(false);
                  share();
                }}
              >
                <span className="setrow-txt">
                  <span className="t">Share</span>
                </span>
                <span className="setrow-ic">
                  <Icon name="arrow_outward" size={20} />
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* The booking doors, as a sheet: Book brings up the options rather
          than jumping to somebody else's site unannounced, and each row says
          whose site it opens. */}
      {bookOpen && (
        <div className="sheet-scrim" onClick={(e) => e.stopPropagation()}>
          <div className="sheet clspeek">
            <span className="clspeek-grab" aria-hidden="true" />
            <div className="clspeek-head">
              <div className="clspeek-titles">
                <h2 className="clspeek-nm">Book</h2>
              </div>
              <button className="clspeek-x" aria-label="Close" onClick={() => setBookOpen(false)}>
                <Icon name="close" size={20} />
              </button>
            </div>
            {/* Real buttons, not rows: each is the one act this sheet exists
                for, and a grey row read as a setting. */}
            <div className="bookbtns">
              {bookLinks.map((l) => (
                <a
                  key={l.url}
                  className="bookbtn"
                  href={l.url}
                  target="_blank"
                  rel="noopener nofollow"
                >
                  Book via {l.label}
                  <Icon name="north_east" size={19} />
                </a>
              ))}
            </div>
          </div>
        </div>
      )}

      {manage && (
        <div className="sheet-scrim" onClick={(e) => e.stopPropagation()}>
          <div className="sheet clspeek">
            <span className="clspeek-grab" aria-hidden="true" />
            <div className="clspeek-head">
              <div className="clspeek-titles">
                <h2 className="clspeek-nm">Manage shift</h2>
              </div>
              <button className="clspeek-x" aria-label="Close" onClick={() => setManage(null)}>
                <Icon name="close" size={20} />
              </button>
            </div>
            {/* Giving up opens the slot and tells the gym; handing it on writes
                it straight onto somebody. Both are notices that go out the
                moment they run, so both confirm first. */}
            <div className="settingslist" style={{ marginTop: 22 }}>
              <button className="setrow" disabled={pending} onClick={() => runShift("give")}>
                <span className="setrow-txt">
                  <span className="t">Give up this shift</span>
                  <span className="s">
                    The date opens up and everyone who coaches here is told.
                  </span>
                </span>
              </button>
              {manage.sendable.length > 0 && (
                <button className="setrow" disabled={pending} onClick={() => setSending(true)}>
                  <span className="setrow-txt">
                    <span className="t">Transfer shift</span>
                    <span className="s">Hand this date to somebody on the gym&rsquo;s list.</span>
                  </span>
                  <span className="setrow-chev">
                    <Icon name="chevron_right" size={22} />
                  </span>
                </button>
              )}
            </div>
            {shiftErr && <p className="err">{shiftErr}</p>}
          </div>
        </div>
      )}

      {sending && manage && (
        <div className="sheet-scrim" onClick={(e) => e.stopPropagation()}>
          <div className="sheet clspeek">
            <span className="clspeek-grab" aria-hidden="true" />
            <div className="clspeek-head">
              <div className="clspeek-titles">
                <h2 className="clspeek-nm">Hand it to</h2>
              </div>
              <button className="clspeek-x" aria-label="Close" onClick={() => setSending(false)}>
                <Icon name="close" size={20} />
              </button>
            </div>
            {/* The names first, then a confirm: eight names under one verb read
                as eight options rather than one decision. */}
            <div className="settingslist" style={{ marginTop: 22 }}>
              {manage.sendable.map((s2) => (
                <button
                  key={s2.id}
                  className="setrow"
                  disabled={pending}
                  onClick={() => runShift("send", s2.id)}
                >
                  <span className="setrow-txt">
                    <span className="t">{s2.name}</span>
                  </span>
                </button>
              ))}
            </div>
            {shiftErr && <p className="err">{shiftErr}</p>}
          </div>
        </div>
      )}

      {confirm && (
        <div className="sheet-scrim" onClick={(e) => e.stopPropagation()}>
          <div className="sheet confirmsheet">
            <h3>
              {confirm === "occurrence" ? `Cancel ${cls.when}?` : `Delete ${cls.name}?`}
            </h3>
            <p className="lead">
              {confirm === "occurrence"
                ? "This date comes off your week and everyone following you is told. The class keeps running after it."
                : "Every date it runs comes off, and it stops appearing on your page."}
            </p>
            <div className="publishwrap nostick">
              <button className="btn si" disabled={pending} onClick={() => run(confirm)}>
                {pending ? "Working…" : confirm === "occurrence" ? "Cancel it" : "Delete it"}
              </button>
            </div>
            <button className="confirm-keep" disabled={pending} onClick={() => setConfirm(null)}>
              Keep it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

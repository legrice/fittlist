"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteClass } from "@/app/actions/classes";
import { classDetail, type ClassDetail } from "@/app/actions/classdetail";
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
  coach?: { name: string; handle: string | null; photo?: string | null; color?: string } | null;
  /** Where the fuller detail is loaded from: a handle, or `s/{slug}` for a
   *  gym's class. Without it the sheet stays a summary, which is all a row
   *  built from a calendar the viewer already owns needs. */
  base?: string;
  /** Your own class only. */
  repeats?: string | null;
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
  onToast: (msg: string) => void;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState<"occurrence" | "all" | null>(null);
  const [pending, start] = useTransition();
  // The depth, loaded only when somebody asks for it. Most taps are somebody
  // checking a time, and a photograph and a description are a lot to send for
  // that; this way the sheet is instant and the detail is one tap behind it.
  const [full, setFull] = useState<ClassDetail | null>(null);
  const [loading, setLoading] = useState(false);

  // The rota's own controls, loaded from the same place the depth is: whether
  // this date can be given up, and who it can be handed to, are the gym's
  // answers rather than anything a calendar row knows.
  const [manage, setManage] = useState<ClassDetail["shift"] | null>(null);
  const [sending, setSending] = useState(false);
  const [shiftErr, setShiftErr] = useState("");

  const openManage = () => {
    if (loading || !cls.base) return;
    setLoading(true);
    classDetail(cls.base, cls.id, cls.iso)
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

  // The depth loads the moment the sheet opens: this is the classic viewer
  // again, by Matt's call, so the photograph, the kicker, the address and the
  // booking door are the sheet rather than a second tap behind it. The
  // summary fields paint instantly from the row while it arrives.
  useEffect(() => {
    if (!cls.base) return undefined;
    let live = true;
    setLoading(true);
    classDetail(cls.base, cls.id, cls.iso)
      .then((d) => live && setFull(d))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cls.id, cls.iso, cls.base]);

  // Hand the picture on: the caller's sheet when it has one, the native
  // share (or the clipboard) pointed at the class page when it doesn't.
  const share = async () => {
    if (onShare) return onShare();
    const url = full?.shareUrl;
    if (!url) return;
    try {
      if (navigator.share) await navigator.share({ url });
      else {
        await navigator.clipboard.writeText(url);
        onToast("Link copied, ready to paste");
      }
    } catch {
      /* dismissed the share tray */
    }
  };
  const bookLink = !cls.mine ? full?.links[0] : undefined;

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
      <div className="sheet clspeek clsfull">
        {/* The photograph leads when the class has one, running to the
            sheet's own top edge; the close floats on it as a white circle,
            where the classic viewer kept its corner controls. */}
        {full?.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="clsfull-photo" src={full.image} alt="" />
        )}
        <button
          className={`clspeek-x clsfull-x${full?.image ? " onphoto" : ""}`}
          aria-label="Close"
          onClick={onClose}
        >
          <Icon name="close" size={20} />
        </button>
        {!full?.image && <span className="clspeek-grab" aria-hidden="true" />}

        {full?.classType && <p className="clsfull-kick">{full.classType}</p>}
        <h2 className="clspeek-nm">{cls.name}</h2>
        {cls.coach && <CoachBy coach={cls.coach} />}

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
                {full?.studioAddress && <span className="s">{full.studioAddress}</span>}
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

        {full?.description && (
          <div className="clsfull-about">
            <h3>About</h3>
            <p>{full.description}</p>
          </div>
        )}

        {/* Your own class keeps its working controls above the footer: they
            are about changing the thing, where the footer is about handing
            it on. */}
        {cls.mine && cls.shift && (
          <div className="clspeek-cta">
            <button className="clspeek-btn ghost" onClick={openManage}>
              {loading ? "Opening…" : "Manage shift"}
            </button>
          </div>
        )}
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

        {/* The footer, pinned to the sheet's bottom edge: Share in ink on
            the left, Book in the brand colour on the right when the class
            has a booking door, and Share alone when it doesn't. */}
        <div className="clsfull-cta">
          <button className="clsfull-btn dark" onClick={share}>
            Share
          </button>
          {bookLink && (
            <a
              className="clsfull-btn book"
              href={bookLink.url}
              target="_blank"
              rel="noopener nofollow"
            >
              Book
            </a>
          )}
        </div>
      </div>

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

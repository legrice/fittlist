"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { adminClassEditor } from "@/app/actions/admin";
import { deleteClass } from "@/app/actions/classes";
import { classDetail, type ClassDetail } from "@/app/actions/classdetail";
import { setGoing } from "@/app/actions/going";
import { giveUpShift, sendShiftTo } from "@/app/actions/gym";
import { reportClass } from "@/app/actions/reports";
import { Icon } from "@/components/Icon";
import { announceSaved } from "@/components/SaveEducation";
import { ShareCardSheet } from "@/components/ShareCardSheet";
import { FittlistShareSheet } from "@/components/InAppShare";

const Adder = dynamic(() => import("@/components/Adder").then((module) => module.Adder));

/**
 * A class, tapped.
 *
 * One sheet, two readings. Your own class offers Edit, Cancel this date, and
 * the quiet way to take the whole thing off your week. Somebody else's offers
 * the picture and the way to their week. Nothing offers "add to my calendar",
 * because a member has no calendar to add it to any more: they read the week
 * of the people they follow, and that is the whole relationship.
 *
 * This is also the direct-link event view, so a class looks the same whether
 * it opened from a calendar row or from a link somebody was sent.
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
  /** The opening row already knows this occurrence is on the viewer's
   * calendar, so Remove can paint before the detail request returns. */
  saved?: boolean;
  mine: boolean;
};

/** One adapter for every class door. Lists may paint this shape themselves
 * for an instant first frame; routes and generic openers already have the
 * complete detail and come through here so they cannot drift to another
 * sheet treatment. */
export function peekFromDetail(detail: ClassDetail): PeekClass {
  return {
    id: detail.id,
    iso: detail.whenIso,
    name: detail.name,
    when: detail.dateLong,
    time: detail.time,
    studio: detail.studioName ?? detail.location,
    studioHref: detail.studioHref,
    coach: detail.coachName
      ? {
          name: detail.coachName,
          handle: detail.coachHandle,
          photo: detail.coachPhoto,
          color: detail.coachColor,
        }
      : null,
    base: detail.handle,
    saved: detail.added,
    mine: detail.mine,
    preview: {
      description: detail.description,
      classType: detail.classType,
      links: detail.links,
      studioAddress: detail.studioAddress,
    },
  };
}

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
  allowWeekAdd = true,
  initialDetail = null,
}: {
  cls: PeekClass;
  onClose: () => void;
  /** Your own class: open the editor on it. */
  onEdit?: () => void;
  /** Somebody else's: hand the picture on. */
  onShare?: () => void;
  onChanged: () => void;
  onToast: (msg: string, hlKey?: string) => void;
  /** Reading/discovery surfaces keep RSVP but do not ask members to maintain
   * a second calendar. Calendar-owned surfaces may still opt into Add. */
  allowWeekAdd?: boolean;
  /** A direct route or generic opener has already loaded the class. */
  initialDetail?: ClassDetail | null;
}) {
  const router = useRouter();
  const sheetRef = useRef<HTMLDivElement>(null);
  const [confirm, setConfirm] = useState<"occurrence" | "all" | null>(null);
  const [pending, start] = useTransition();
  // The depth, loaded only when somebody asks for it. Most taps are somebody
  // checking a time, and a photograph and a description are a lot to send for
  // that; this way the sheet is instant and the detail is one tap behind it.
  const [full, setFull] = useState<ClassDetail | null>(initialDetail);
  const [loading, setLoading] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  // The viewer's mark, locally, so the button flips on the tap rather than
  // the round trip. Null until touched; the loaded detail is the truth
  // before that.
  const [savedNow, setSavedNow] = useState<boolean | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  // The rota's own controls, loaded from the same place the depth is: whether
  // this date can be given up, and who it can be handed to, are the gym's
  // answers rather than anything a calendar row knows.
  const [manage, setManage] = useState<ClassDetail["shift"] | null>(null);
  const [sending, setSending] = useState(false);
  const [shiftErr, setShiftErr] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reported, setReported] = useState(false);
  const [adminAdder, setAdminAdder] = useState<Awaited<
    ReturnType<typeof adminClassEditor>
  > | null>(null);

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
    if (!detailKey || (initialDetail?.id === cls.id && initialDetail.whenIso === cls.iso)) return undefined;
    let live = true;
    setLoading(true);
    classDetail(detailKey, cls.id, cls.iso)
      .then((d) => live && setFull(d))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cls.id, cls.iso, cls.base, initialDetail]);

  // Share first means people and a link. The designed image is a deliberate
  // second door inside that sheet, rather than making every share wait for an
  // image editor when somebody only wants to text the class to a friend.
  const share = () => {
    if (onShare) return onShare();
    setShareOpen(true);
  };

  const editClass = () => {
    setMoreOpen(false);
    if (cls.mine && onEdit) {
      onEdit();
      return;
    }
    if (!full?.adminEdit || pending) return;
    start(async () => {
      const editor = await adminClassEditor(cls.id);
      if (!editor) {
        onToast("That class can't be edited here");
        return;
      }
      if (!editor.prefill.specificDate) editor.prefill.occurrenceDate = cls.iso;
      setAdminAdder(editor);
    });
  };

  const sendReport = (reason: string) => {
    if (pending) return;
    start(async () => {
      const res = await reportClass(cls.id, reason);
      setReportOpen(false);
      if (!res.ok) {
        onToast(res.error ?? "Couldn't send that");
        return;
      }
      setReported(true);
      onToast("Thanks. We'll take a look.");
    });
  };
  // The row's carried depth paints first and the fetch confirms it: the
  // sheet must not grow a paragraph after it is already up.
  const description = full?.description ?? cls.preview?.description ?? null;
  const classType = full?.classType ?? cls.preview?.classType ?? null;
  const bookLinks = !cls.mine ? (full?.links ?? cls.preview?.links ?? []) : [];

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
        {/* Secondary tools stay on the left; Close stays on the right. Both
            remain visible while a long class scrolls. */}
        <button
          className="clspeek-x clsfull-more"
          aria-label="More class actions"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((open) => !open)}
        >
          <Icon name="more_horiz" size={20} />
        </button>
        <button className="clspeek-x clsfull-x" aria-label="Close" onClick={onClose}>
          <Icon name="close" size={20} />
        </button>
        {moreOpen && full && (
          <div className="clsfull-menu" role="menu">
            <a
              className="ovmenu-item"
              role="menuitem"
              href={full.googleUrl}
              target="_blank"
              rel="noopener nofollow"
              onClick={() => setMoreOpen(false)}
            >
              <Icon name="calendar_month" size={19} /> Add to Google Calendar
            </a>
            <a
              className="ovmenu-item"
              role="menuitem"
              href={full.icsHref}
              onClick={() => setMoreOpen(false)}
            >
              <Icon name="calendar_today" size={19} /> Add to Apple or Outlook
            </a>
            <button
              className="ovmenu-item"
              role="menuitem"
              onClick={() => {
                setMoreOpen(false);
                void share();
              }}
            >
              <Icon name="ios_share" size={19} /> Share class
            </button>
            {(cls.mine && onEdit || full.adminEdit) && (
              <button className="ovmenu-item" role="menuitem" onClick={editClass}>
                <Icon name="edit" size={19} /> Edit class
              </button>
            )}
            {!cls.mine && !reported && (
              <button
                className="ovmenu-item ovmenu-quiet"
                role="menuitem"
                onClick={() => {
                  setMoreOpen(false);
                  setReportOpen(true);
                }}
              >
                <Icon name="flag" size={19} /> Report this class
              </button>
            )}
          </div>
        )}
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

        {!cls.mine && (bookLinks.length > 0 || full) && (
          <div className="clsfull-sections">
            {bookLinks.length > 0 && (
              <section className="clsfull-linksection">
                <h3>Where to book</h3>
                <div className="clsfull-linkrows">
                  {bookLinks.map((link) => (
                    <a key={link.url} href={link.url} target="_blank" rel="noopener nofollow">
                      <span>{link.label}</span>
                      <Icon name="north_east" size={19} />
                    </a>
                  ))}
                </div>
              </section>
            )}
            <section className="clsfull-linksection">
              <h3>Share</h3>
              <button type="button" onClick={share}>
                <span>Share this class</span>
                <Icon name="reply" size={20} className="share-arrow-forward" />
              </button>
            </section>
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

        {/* The footer is reserved for a calendar state change. Booking and
            sharing are useful details above, not the primary purpose of the
            sheet. */}
        {(cls.mine && cls.shift || cls.saved || full?.canAdd && (full.rsvp || allowWeekAdd)) && (
        <div className="clsfull-cta">
          {cls.mine && cls.shift && (
            <button className="clsfull-btn manage" onClick={openManage}>
              {loading ? "Opening…" : "Manage shift"}
            </button>
          )}
          {(cls.saved || full?.canAdd && (full.rsvp || allowWeekAdd)) &&
            (() => {
              const on = savedNow ?? cls.saved ?? full?.added ?? false;
              const word = full?.rsvp ? (on ? "RSVP’d" : "RSVP") : on ? "Remove from calendar" : "Save to calendar";
              return (
                <button
                  className={`clsfull-btn save${on ? " on" : ""}`}
                  disabled={saveBusy}
                  aria-pressed={on}
                  onClick={async () => {
                    if (saveBusy) return;
                    setSaveBusy(true);
                    setSavedNow(!on);
                    const res = await setGoing(cls.id, cls.iso, !on);
                    if (!res.ok) setSavedNow(on);
                    else if (!on) {
                      announceSaved(cls.id, cls.iso);
                      onToast(
                        full?.rsvp
                          ? "RSVP’d. It’s on your calendar."
                          : "Saved to your week",
                        `${cls.id}.${cls.iso}`,
                      );
                    } else {
                      onToast("Removed from your calendar");
                    }
                    setSaveBusy(false);
                    onChanged();
                  }}
                >
                  {!full?.rsvp && (
                    <Icon name={on ? "bookmark_added" : "bookmark"} size={20} />
                  )}
                  {word}
                </button>
              );
            })()}
        </div>
        )}
      </div>

      {shareOpen && (
        <FittlistShareSheet
          title={cls.name}
          url={full?.shareUrl ?? `${window.location.origin}/${cls.base ?? "calendar"}/${cls.id}?d=${cls.iso}`}
          onShareImage={() => {
            setShareOpen(false);
            setCardOpen(true);
          }}
          onClose={() => setShareOpen(false)}
          onToast={onToast}
        />
      )}

      {cardOpen && (
        <ShareCardSheet
          noThemes={!!full?.image}
          path={`/api/card/class/${cls.id}`}
          fileName={`fittlist-${cls.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`}
          title="Share this class"
          lead="A square picture of the class, made for sharing."
          alt={`${cls.name} as a card`}
          linkUrl={full?.shareUrl}
          linkTitle={cls.name}
          onClose={() => setCardOpen(false)}
          onToast={onToast}
        />
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
      {reportOpen && (
        <div className="sheet-scrim" onClick={(e) => e.stopPropagation()}>
          <div className="sheet confirmsheet">
            <h2>What&rsquo;s wrong with it?</h2>
            <p className="lead">This goes to Fittlist, not to the coach.</p>
            <div className="reportreasons">
              {["Not a real class", "No longer running", "Wrong time or place", "Something else"].map(
                (reason) => (
                  <button
                    key={reason}
                    className="btn ghost reportreason"
                    disabled={pending}
                    onClick={() => sendReport(reason)}
                  >
                    {reason}
                  </button>
                ),
              )}
            </div>
            <button className="confirm-keep" disabled={pending} onClick={() => setReportOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {adminAdder && full && (
        <Adder
          studios={adminAdder.studios}
          templates={[]}
          customTypes={adminAdder.customTypes}
          lastUsed={{
            startTime: adminAdder.prefill.startTime,
            durationMin: adminAdder.prefill.durationMin,
            studioId: adminAdder.prefill.studioId,
          }}
          subsCount={0}
          firstPublish={false}
          prefill={adminAdder.prefill}
          onClose={() => setAdminAdder(null)}
          onToast={onToast}
          onPublished={() => {
            setAdminAdder(null);
            onToast("Saved");
            onChanged();
            router.refresh();
          }}
          onDeleted={(message) => {
            setAdminAdder(null);
            onToast(message);
            onChanged();
            onClose();
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

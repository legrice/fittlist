"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { adminClassEditor, adminSetClassImage, adminSetClassLink } from "@/app/actions/admin";
import { classDetail, type ClassDetail } from "@/app/actions/classdetail";
import { deleteClass } from "@/app/actions/classes";
import { setGoing, setGoingVisibility } from "@/app/actions/going";
import { claimShift, giveUpShift, sendShiftTo } from "@/app/actions/gym";
import { reportClass } from "@/app/actions/reports";
import { Adder } from "@/components/Adder";
import { AgendaAvatar } from "@/components/Agenda";
import { Icon } from "@/components/Icon";
import { ShareCardSheet } from "@/components/ShareCardSheet";
import { announceSaved } from "@/components/SaveEducation";
import { readPhoto } from "@/lib/photo";
import { Roster } from "@/components/Roster";
import { Toast, useToast } from "@/components/Toast";
import { Wordmark } from "@/components/Wordmark";

// A class, worn as a full-screen overlay. The page you were on stays visible
// through a light blur, so opening a class reads as leaning in for a closer
// look rather than going somewhere. Floating circles top left and right (back,
// share), the class itself in open space, and the two things to do with it on
// a dark pill at the bottom: Book, and the heart. Saving is the heart filling
// in; the word leaves with the tap.
//
// The page at /{handle}/{classId} stays: a link somebody was sent has to open
// something real, and the share here points at exactly that. The page wears
// this same component, seeded server-side via `initial`, so the two doors
// can't drift apart.
export function ClassSheet({
  handle,
  classId,
  iso,
  onClose,
  onChanged,
  initial,
  backLabel,
  claimVia,
}: {
  /** A coach's handle, or a gym class's page base ("s/ironbound"). Callers
   *  hand over whatever their row uses to build an href, which for a gym is
   *  the prefixed base; the lookup wants the bare key, so this derives it. */
  handle: string;
  classId: string;
  /** The occurrence that was tapped, so a weekly class opens on the right day. */
  iso?: string;
  onClose: () => void;
  /** Fired after a save or a remove, so the list behind can catch up. */
  onChanged?: (added: boolean) => void;
  /** The page hands its server-loaded detail in, skipping the client fetch. */
  initial?: ClassDetail;
  /** Names where back goes when the circle is a page's only way out. */
  backLabel?: string;
  /** Set for signed-out visitors on the page: the made-with footer, attributed
   *  to the coach whose link brought them here. */
  claimVia?: string | null;
}) {
  // The base is a URL segment and the key is what classDetail looks the owner
  // up by, and they are not the same string for a gym: its classes live under
  // /s/{slug} while the lookup takes the bare slug. Conflating them is how a
  // link 404s, and it did: a gym class on a member's week handed "s/ironbound"
  // straight through and the sheet said the class was gone.
  const lookupKey = handle.startsWith("s/") ? handle.slice(2) : handle;

  const [c, setC] = useState<ClassDetail | null>(initial ?? null);
  const [missing, setMissing] = useState(false);
  const [added, setAdded] = useState(initial?.added ?? false);
  // Whether the mark shows to the viewer's followers. The moment of adding
  // used to be the only place this could be answered, which meant it could
  // not be changed afterwards at all; it lives here now, beside the mark.
  const [markPublic, setMarkPublic] = useState(initial?.addedPublic ?? true);
  const [pending, start] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();
  const [canShareFiles, setCanShareFiles] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [reported, setReported] = useState(false);
  const [favOn, setFavOn] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  // The admin's link door, same shape as the photo one: paste, save, done.
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  // The admin's repair kit for a reported class: the coach's own full
  // editor, opened as the owner, by Matt's call. The half-editor it
  // replaces changed four fields in place; this one is the whole form,
  // delete scopes included (this date off, this weekday, the whole set),
  // which is exactly the Susan case: out of town is one date, gone is all
  // of them.
  const [adminAdder, setAdminAdder] = useState<Awaited<
    ReturnType<typeof adminClassEditor>
  > | null>(null);
  const [confirmKill, setConfirmKill] = useState(false);
  const openAdminEdit = () => {
    if (!c || pending) return;
    start(async () => {
      const ed = await adminClassEditor(c.id);
      if (!ed) {
        toast("That class can't be edited here");
        return;
      }
      // The date this sheet was opened on, so the delete confirm can offer
      // "just this one".
      if (!ed.prefill.specificDate) ed.prefill.occurrenceDate = c.whenIso;
      setAdminAdder(ed);
    });
  };
  const adminKill = () => {
    if (!c || pending) return;
    start(async () => {
      const res = await deleteClass(c.id, "all");
      if (!res.ok) {
        toast(res.error ?? "Couldn't delete that");
        return;
      }
      setConfirmKill(false);
      toast("Class deleted. Whoever marked it has been told.");
      onChanged?.(false);
      onClose();
    });
  };
  const saveAdminLink = () => {
    if (!c || shifting) return;
    startShift(async () => {
      const res = await adminSetClassLink(c.id, linkUrl);
      if (!res.ok) {
        toast(res.error ?? "Couldn't save that");
        return;
      }
      setLinkOpen(false);
      setLinkUrl("");
      toast("Booking link added");
      const fresh = await classDetail(lookupKey, classId, c.whenIso);
      if (fresh) setC(fresh);
      onChanged?.(added);
    });
  };

  // The admin's photo door, behind the overflow. See adminSetClassImage.
  const photoRef = useRef<HTMLInputElement>(null);
  const favTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The overflow menu closes on any tap outside it, like a menu should.
  useEffect(() => {
    if (!moreOpen) return;
    const onDown = (e: PointerEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [moreOpen]);

  const pickAdminPhoto = (f: File) => {
    if (!c || pending) return;
    readPhoto(f, (img) => {
      start(async () => {
        const res = await adminSetClassImage(c.id, img);
        if (!res.ok) {
          toast(res.error ?? "Couldn't save that");
          return;
        }
        setC({ ...c, image: img });
        toast("Photo saved");
        onChanged?.(added);
      });
    });
  };

  const sendReport = (reason: string) => {
    if (!c || pending) return;
    start(async () => {
      const res = await reportClass(c.id, reason);
      setReportOpen(false);
      if (!res.ok) {
        toast(res.error ?? "Couldn't send that");
        return;
      }
      setReported(true);
      toast("Thanks. We'll take a look.");
    });
  };

  useEffect(() => {
    if (initial) return;
    let live = true;
    classDetail(lookupKey, classId, iso).then((d) => {
      if (!live) return;
      if (!d) {
        setMissing(true);
        return;
      }
      setC(d);
      setAdded(d.added);
      setMarkPublic(d.addedPublic ?? true);
    });
    return () => {
      live = false;
    };
  }, [lookupKey, classId, iso, initial]);

  useEffect(() => {
    setCanShareFiles(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  const toggle = () => {
    if (!c || pending) return;
    const next = !added;
    setAdded(next);
    start(async () => {
      const res = await setGoing(c.id, c.whenIso, next);
      if (!res.ok) {
        setAdded(!next);
        toast(res.error ?? "Something went wrong");
        return;
      }
      onChanged?.(next);
      if (next) {
        announceSaved(c.id, c.whenIso);
        // A fresh mark is public, which is what setGoing writes; the row
        // below has to agree with the row that was just created rather than
        // with whatever the last mark on this class said.
        setMarkPublic(true);
        // The moment of the heart filling: a note, not a ceremony. It says
        // where the class went and offers the way there.
        setFavOn(true);
        if (favTimer.current) clearTimeout(favTimer.current);
        favTimer.current = setTimeout(() => setFavOn(false), 4200);
      } else {
        setFavOn(false);
      }
      // Refresh the room: the server decides who this viewer may see, and a
      // fresh save changes the answer.
      const fresh = await classDetail(lookupKey, classId, iso);
      if (fresh) setC(fresh);
    });
  };

  const share = async () => {
    if (!c) return;
    // The moment you commit is the moment you'd text a friend, so once
    // you're saved the share carries the sentence, not just the link. The
    // group chat stays where it belongs; we just hand it something to say.
    const invite = added ? `I'm going to ${c.name} on ${c.dateLong}. Come with me:` : null;
    const url = added && c.myHandle ? `${c.shareUrl}&g=${c.myHandle}` : c.shareUrl;
    try {
      if (canShareFiles) {
        await navigator.share(
          invite ? { title: c.name, text: invite, url } : { title: c.name, url },
        );
        return;
      }
      await navigator.clipboard.writeText(invite ? `${invite} ${url}` : url);
      toast(invite ? "Invite copied, ready to paste" : "Link copied, ready to paste");
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") toast(c.shareUrl);
    }
  };

  const where = c?.studioName ?? c?.location ?? null;
  const showBook = !!c && c.links.length > 0 && !c.past;
  const [shifting, startShift] = useTransition();
  // The coach's own shift: the floating pill becomes Manage shift, and this
  // sheet holds the two things there are to do with a date that is yours.
  const [manageOpen, setManageOpen] = useState(false);
  // The second level: who takes the date. One Transfer row rather than a row
  // per coach, because eight names under one verb read as eight options.
  const [transferOpen, setTransferOpen] = useState(false);
  // The pause before the notice goes out. Both acts tell people the moment
  // they happen, so the tap that does it is asked once first.
  const [confirmShift, setConfirmShift] = useState<
    null | { kind: "giveup" } | { kind: "send"; id: string; name: string }
  >(null);
  // Giving a date up and taking one are the same shape: one call, then reload
  // the sheet so it says what is true now rather than what was true.
  const act = (
    fn: (
      classId: string,
      occurrenceDate: string,
    ) => Promise<{ ok: boolean; error?: string; pending?: boolean }>,
    done: string,
    /** What to say when the studio has to agree first. Without this a screen
     *  says "it's yours" about a shift nobody has approved. */
    asked?: string,
  ) => {
    if (!c || shifting) return;
    startShift(async () => {
      const res = await fn(c.id, c.whenIso);
      if (!res.ok) {
        toast(res.error ?? "Couldn't do that");
        return;
      }
      toast(res.pending ? (asked ?? "Asked the studio") : done);
      const fresh = await classDetail(lookupKey, classId, c.whenIso);
      if (fresh) setC(fresh);
      onChanged?.(added);
    });
  };
  // Hand the date straight to a named coach. Where the studio approves shift
  // changes this is an ask and the toast says so; where it does not, it is
  // the old thing: agreed over the counter, written down here.
  const send = (toId: string, toName: string) => {
    if (!c || shifting) return;
    startShift(async () => {
      const res = await sendShiftTo(c.id, c.whenIso, toId);
      if (!res.ok) {
        toast(res.error ?? "Couldn't do that");
        return;
      }
      toast(res.pending ? `Asked the studio to send it to ${toName}` : `Transferred to ${toName}`);
      const fresh = await classDetail(lookupKey, classId, c.whenIso);
      if (fresh) setC(fresh);
      onChanged?.(added);
    });
  };

  const isOwner = !!c?.roster;

  return (
    <div className="classoverlay">
      <button className="ovcircle ovcircle-back" aria-label={backLabel ?? "Back"} onClick={onClose}>
        <Icon name="arrow_back" size={21} />
      </button>
      {c && (
        <button className="ovcircle ovcircle-share" aria-label="Share this class" onClick={share}>
          <Icon name="ios_share" size={20} />
        </button>
      )}
      {/* The overflow: everything you might do with a class that isn't the
          class's own two buttons. */}
      {c && (
        <div ref={moreRef}>
          <button
            className="ovcircle ovcircle-more"
            aria-label="More"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((o) => !o)}
          >
            <Icon name="more_horiz" size={20} />
          </button>
          {moreOpen && (
            <div className="ovmenu" role="menu">
              <a
                className="ovmenu-item"
                role="menuitem"
                href={c.googleUrl}
                target="_blank"
                rel="noopener nofollow"
                onClick={() => setMoreOpen(false)}
              >
                <Icon name="calendar_month" size={19} /> Add to Google Calendar
              </a>
              <a
                className="ovmenu-item"
                role="menuitem"
                href={c.icsHref}
                onClick={() => setMoreOpen(false)}
              >
                <Icon name="calendar_today" size={19} /> Add to Apple or Outlook
              </a>
              {/* The share circle above hands over a link. This hands over a
                  picture, which is what a story wants. Same sheet the profile
                  card uses, pointed at this class. */}
              <button
                className="ovmenu-item"
                role="menuitem"
                onClick={() => {
                  setMoreOpen(false);
                  setCardOpen(true);
                }}
              >
                <Icon name="auto_awesome" size={19} /> Share as an image
              </button>
              {c.canAdd && !reported && (
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
              {/* Admin only, and only the picture: most classes were typed in
                  before pictures existed, and this fills the catalog without
                  touching a word of anybody's class. */}
              {c.adminPhoto && (
                <button
                  className="ovmenu-item"
                  role="menuitem"
                  onClick={() => {
                    setMoreOpen(false);
                    photoRef.current?.click();
                  }}
                >
                  <Icon name="palette" size={19} /> {c.image ? "Change the photo" : "Add a photo"}
                </button>
              )}
              {/* Same beta power as the photo, for the booking door: only
                  offered where the class has no link at all, because a link
                  the coach set is their word. */}
              {c.adminLink && (
                <button
                  className="ovmenu-item"
                  role="menuitem"
                  onClick={() => {
                    setMoreOpen(false);
                    setLinkOpen(true);
                  }}
                >
                  <Icon name="link" size={19} /> Add a booking link
                </button>
              )}
              {/* The repair kit, admin only: a reported listing managed on
                  the class itself, where the report's link lands. */}
              {c.adminEdit && (
                <button
                  className="ovmenu-item"
                  role="menuitem"
                  onClick={() => {
                    setMoreOpen(false);
                    openAdminEdit();
                  }}
                >
                  <Icon name="edit" size={19} /> Edit class
                </button>
              )}
              {c.adminEdit && (
                <button
                  className="ovmenu-item ovmenu-quiet"
                  role="menuitem"
                  onClick={() => {
                    setMoreOpen(false);
                    setConfirmKill(true);
                  }}
                >
                  <Icon name="delete" size={19} /> Delete class
                </button>
              )}
              {c.adminPhoto && c.image && (
                <button
                  className="ovmenu-item ovmenu-quiet"
                  role="menuitem"
                  onClick={() => {
                    setMoreOpen(false);
                    start(async () => {
                      const res = await adminSetClassImage(c.id, null);
                      if (!res.ok) {
                        toast(res.error ?? "Couldn't remove that");
                        return;
                      }
                      setC({ ...c, image: null });
                      toast("Photo removed");
                      onChanged?.(added);
                    });
                  }}
                >
                  <Icon name="close" size={19} /> Remove the photo
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {linkOpen && c && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setLinkOpen(false);
          }}
        >
          <div className="sheet">
            <button className="iconbtn sheetclose" aria-label="Close" onClick={() => setLinkOpen(false)}>
              <Icon name="close" size={18} />
            </button>
            <h2>Add a booking link</h2>
            <p className="lead">
              It lands on every {c.name} under this coach, and on their added class, so it
              stays when the class is re-added. Only classes with no link are touched.
            </p>
            <label className="flabel" htmlFor="alUrl">The booking page</label>
            <input
              id="alUrl"
              className="editinput"
              type="url"
              autoCapitalize="none"
              placeholder="Paste a link"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
            />
            <div className="publishwrap nostick">
              <button className="btn si" disabled={shifting || !linkUrl.trim()} onClick={saveAdminLink}>
                Save the link
              </button>
            </div>
          </div>
        </div>
      )}

      {c?.adminPhoto && (
        <input
          ref={photoRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) pickAdminPhoto(f);
            e.target.value = "";
          }}
        />
      )}
      {/* The scroll layer: the overlay itself must not scroll, or the fixed
          circles and the bottom pill ride away with the content. */}
      <div className="classoverlay-scroll">
      {missing ? (
        <div className="classoverlay-body">
          <p className="lead" style={{ textAlign: "center", marginTop: "30vh" }}>
            That class isn&rsquo;t there any more.
          </p>
        </div>
      ) : !c ? (
        // A blank beat rather than a spinner: the overlay is already open and
        // the data lands in a moment.
        <div className="classoverlay-body" aria-hidden="true" />
      ) : (
        <div className="classoverlay-body">
          {/* The picture, when there is one: full bleed across the top of the
              sheet, the same way a profile leads with a face. A class without
              one reads exactly as it did, which is the point of it staying
              optional. */}
          {c.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="classoverlay-img" src={c.image} alt="" />
          )}
          {/* A dated link that has been and gone has to say so before the
              class reads as something you can still turn up to, so it says it
              where the eye lands: between the photograph and the listing,
              rather than in a grey line under the description where it was
              read after everything it qualifies. A quiet brand wash, because
              it is a fact about the date and not a warning. */}
          {c.past && !added && (
            <p className="classsheet-gone">
              <Icon name="schedule" size={18} />
              This one has already run.
            </p>
          )}
          {c.classType && <span className="evtype classoverlay-type">{c.classType}</span>}
          <h2 className="classoverlay-nm">{c.name}</h2>
          {/* Whose class it is, as a face and a name, and a way to them: from
              the feed or your week this is often the first time you meet a
              coach, and their name is the natural next tap.

              A gym is never the name here: it is a place rather than a person,
              it has no page to tap through to, and "coached by Ironbound
              Performance Athletics" is not true of anybody. But the person on
              the rota is, where they show their shifts, because then they have
              already published this class as theirs and it carries their name
              on their own page. Where they do not, the row is gone entirely and
              the studio row below says where: whether a gym's schedule names
              anybody is the gym's call, and it stays off.

              The condition is `coachHandle` rather than "is the owner a gym",
              because what this row needs is somebody with a page behind it. */}
          {c.coachHandle && (
          <Link className="classoverlay-coach" href={`/${c.coachHandle}`}>
            {c.coachPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="classsheet-av" src={c.coachPhoto} alt="" />
            ) : (
              <span
                className="classsheet-av classsheet-av-empty"
                style={{ background: c.coachColor }}
                aria-hidden="true"
              >
                {(c.coachName.trim().charAt(0) || "?").toUpperCase()}
              </span>
            )}
            <span className="classoverlay-coach-txt">
              <span className="k">Coached by</span> {c.coachName}
            </span>
            <Icon name="chevron_right" size={18} />
          </Link>
          )}

          <div className="evfacts classoverlay-facts">
            <div className="evfact">
              <Icon name="event" size={22} />
              <span className="evfact-txt">
                <span className="t">{c.dateLong}</span>
                <span className="s">
                  {c.time} · {c.durationMin} min
                </span>
              </span>
            </div>
            {where &&
              (c.studioHref ? (
                <Link className="evfact" href={c.studioHref}>
                  <Icon name="place" size={22} />
                  <span className="evfact-txt">
                    <span className="t">{c.studioName}</span>
                    {c.studioAddress && <span className="s">{c.studioAddress}</span>}
                  </span>
                </Link>
              ) : (
                <div className="evfact">
                  <Icon name="place" size={22} />
                  <span className="evfact-txt">
                    <span className="t">{where}</span>
                  </span>
                </div>
              ))}
          </div>

          {/* Full screen means the description gets to just be there; the old
              sheet clamped it to keep the add button on screen, and the pill
              floats now. */}
          {c.description?.trim() && (
            <>
              <h3 className="ovsec-h">About</h3>
              <p className="evdesc classoverlay-desc">{c.description}</p>
            </>
          )}

          {/* The mark's own visibility, where the mark is. A Going mark shows
              to your followers by default; this is the way off it, and unlike
              the note that used to carry it, this one is still here tomorrow.
              Only while the class is in your plans, because otherwise there
              is nothing for it to be about. */}
          {added && c.canAdd && (
            <button
              className="setrow classsheet-vis"
              aria-pressed={!markPublic}
              disabled={pending}
              onClick={() => {
                const next = !markPublic;
                setMarkPublic(next);
                start(async () => {
                  const res = await setGoingVisibility(c.id, c.whenIso, next);
                  if (!res.ok) {
                    setMarkPublic(!next);
                    toast(res.error ?? "Something went wrong");
                    return;
                  }
                  toast(next ? "Your followers can see this one." : "Only you and the coach can see this one.");
                });
              }}
            >
              <span className="setrow-ic">
                <Icon name={markPublic ? "visibility" : "lock"} size={24} />
              </span>
              <span className="setrow-txt">
                <span className="t">Show on your activity</span>
                <span className="s">
                  {markPublic ? "Your followers can see this one" : "Only you and the coach"}
                </span>
              </span>
              <span className={`switch${markPublic ? " on" : ""}`} aria-hidden="true">
                <span className="switch-knob" />
              </span>
            </button>
          )}

          {/* RSVP: the count reads to everyone once somebody is in, and
              whoever is going is told where their name goes before they
              tap. Never an empty count. */}
          {c.rsvp && c.rsvpCount > 0 && !c.roster && (
            <p className="rsvpcount">
              {c.rsvpCount} RSVP&rsquo;d
            </p>
          )}
          {c.rsvp && c.canAdd && (
            <p className="rsvpnote">
              Your name goes to {c.coachName.split(/\s+/)[0]} when you RSVP.
            </p>
          )}

          {/* Owner only: who added this occurrence. On an RSVP class this
              is the door list, read off a phone; no check-in, no codes. */}
          {c.roster && (
            <div className="classsheet-roster">
              <h3 className="classsheet-roster-h">
                {c.rsvp ? "RSVP'd" : "Going"}
                {c.roster.length > 0 ? ` · ${c.roster.length}` : ""}
              </h3>
              <Roster people={c.roster} />
            </div>
          )}

          {/* The rota, from the coach's side: a slot with nobody on it, seen
              by somebody who teaches here. Their own shift has no box any
              more; the floating pill says Manage shift and holds both moves. */}
          {c.shift?.canClaim && (
            <div className="shiftbox">
              <h3 className="ovsec-h">Open shift</h3>
              <p className="shiftbox-s">Nobody is on this one yet.</p>
              <button
                className="btn si shiftbox-btn"
                disabled={shifting}
                onClick={() => act(claimShift, "It's yours", "Asked the studio")}
              >
                {shifting ? "One moment…" : "I'll take it"}
              </button>
            </div>
          )}

          {/* Visitors only, on the page: the growth loop rides the artifact
              that actually gets shared around. */}
          {claimVia && (
            <div className="madewith">
              Made with <Wordmark variant="ink" className="mw-logo" />. Coach classes?{" "}
              <Link href={`/?via=${claimVia}`}>Claim your page</Link>
            </div>
          )}
        </div>
      )}
      </div>

      {/* The floating pill: Book on the left, the calendar on the right. The
          owner's pill is their one action instead, and so is the coach's on
          their own shift: the date is theirs to manage, not to book. */}
      {c && (isOwner || c.shift?.canGiveUp || showBook || c.canAdd) && (
        <>
          <div className="classoverlay-cta">
            {isOwner ? (
              <Link className="ovcta-btn" href={`/app?edit=${c.id}&d=${c.whenIso}`}>
                <Icon name="edit" size={19} /> Edit this class
              </Link>
            ) : c.shift?.canGiveUp ? (
              <button className="ovcta-btn" onClick={() => setManageOpen(true)}>
                <Icon name="person_add" size={19} /> Manage shift
              </button>
            ) : (
              <>
                {showBook && (
                  <button className="ovcta-btn" onClick={() => setBookOpen(true)}>
                    Book
                  </button>
                )}
                {showBook && c.canAdd && <span className="ovcta-div" aria-hidden="true" />}
                {c.canAdd && (
                  <button
                    className={`ovcta-btn ovcta-save${added ? " on" : ""}`}
                    disabled={pending}
                    aria-pressed={added}
                    aria-label={
                      c.rsvp
                        ? added
                          ? "You RSVP'd"
                          : "RSVP"
                        : added
                          ? "Added to your week"
                          : "Add to your week"
                    }
                    onClick={toggle}
                  >
                    {/* An empty ribbon, then the same ribbon with the tick
                        cut into it. On an RSVP class the word changes with
                        the deal: a save the organizer can see. */}
                    <Icon name={added ? "check_circle" : "add_circle"} size={21} />
                    {c.rsvp ? (added ? "" : "RSVP") : added ? "" : "Add"}
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* Your shift, managed: hand the date back to the pool, or straight to
          a coach the gym has named. The list is the gym's shift list, because
          anyone may say they coach here and not everyone who does takes these
          classes; an empty list just leaves the hand-back. */}
      {manageOpen && c?.shift?.canGiveUp && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setManageOpen(false);
          }}
        >
          <div className="sheet">
            <button
              className="iconbtn sheetclose"
              aria-label="Close"
              onClick={() => setManageOpen(false)}
            >
              <Icon name="close" size={18} />
            </button>
            <h2>Your shift</h2>
            <p className="lead">
              You&rsquo;re on {c.name}, {c.dateLong}.
            </p>
            <div className="settingslist ownermenu">
              <button
                className="setrow"
                disabled={shifting}
                onClick={() => {
                  setManageOpen(false);
                  setConfirmShift({ kind: "giveup" });
                }}
              >
                <span className="setrow-ic"><Icon name="campaign" size={24} /></span>
                <span className="setrow-txt">
                  <span className="t">Give up this shift</span>
                  <span className="s">Opens the slot; the gym and every coach who could cover it are told</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
              </button>
              {c.shift.sendable.length > 0 && (
                <button
                  className="setrow"
                  disabled={shifting}
                  onClick={() => {
                    setManageOpen(false);
                    setTransferOpen(true);
                  }}
                >
                  <span className="setrow-ic"><Icon name="person_add" size={24} /></span>
                  <span className="setrow-txt">
                    <span className="t">Transfer shift</span>
                    <span className="s">Hand the date to a coach you&rsquo;ve already squared it with</span>
                  </span>
                  <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Who takes the date. The list is the gym's shift list, because anyone
          may say they coach here and not everyone who does takes these
          classes. The consequence is said once up top rather than under every
          name. */}
      {transferOpen && c?.shift?.canGiveUp && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setTransferOpen(false);
          }}
        >
          <div className="sheet">
            <button
              className="iconbtn sheetclose"
              aria-label="Close"
              onClick={() => setTransferOpen(false)}
            >
              <Icon name="close" size={18} />
            </button>
            <h2>Transfer shift</h2>
            <p className="lead">
              Who takes {c.name}, {c.dateLong}? They and the gym are told; the rest of the
              week is unchanged.
            </p>
            <div className="settingslist ownermenu">
              {c.shift.sendable.map((p) => (
                <button
                  key={p.id}
                  className="setrow"
                  disabled={shifting}
                  onClick={() => {
                    setTransferOpen(false);
                    setConfirmShift({ kind: "send", id: p.id, name: p.name });
                  }}
                >
                  <span className="setrow-ic">
                    {/* The face, not a glyph. This is the moment somebody
                        picks who to hand a class to, and a column of
                        identical outlines makes colleagues into text to
                        parse. */}
                    <AgendaAvatar photo={p.photo} name={p.name} color={p.color} cls="sendav" />
                  </span>
                  <span className="setrow-txt">
                    <span className="t">{p.name}</span>
                  </span>
                  <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Are you sure: both acts notify people the moment they happen, so
          neither runs off a single tap. Same confirm shape as removing a
          plan: what happens, the doing button, and Keep it. */}
      {confirmShift && c?.shift?.canGiveUp && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmShift(null);
          }}
        >
          <div className="sheet confirmsheet">
            {confirmShift.kind === "giveup" ? (
              <>
                <h2>Give up this shift?</h2>
                <p className="lead">
                  {c.name}, {c.dateLong} opens up, and the gym and every coach who could
                  cover it are told. If nobody takes it, you can claim it back.
                </p>
              </>
            ) : (
              <>
                <h2>Transfer to {confirmShift.name}?</h2>
                <p className="lead">
                  {c.name}, {c.dateLong} becomes theirs. They and the gym are told; the
                  rest of the week is unchanged.
                </p>
              </>
            )}
            <div className="publishwrap nostick">
              <button
                className="btn si"
                disabled={shifting}
                onClick={() => {
                  const cs = confirmShift;
                  setConfirmShift(null);
                  if (cs.kind === "giveup") act(giveUpShift, "Handed back");
                  else send(cs.id, cs.name);
                }}
              >
                {confirmShift.kind === "giveup"
                  ? "Give it up"
                  : `Transfer to ${confirmShift.name}`}
              </button>
              <button
                className="btn ghost"
                style={{ marginTop: 8 }}
                onClick={() => setConfirmShift(null)}
              >
                Keep it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* The hand-off: booking and money live on the studio's site, and
          saying so beats a link that quietly walks you out of the app. */}
      {bookOpen && c && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setBookOpen(false);
          }}
        >
          <div className="sheet confirmsheet">
            {/* The way out is the corner, like every other sheet. A worded
                decline reads as an answer to a question nobody asked. */}
            <button
              className="iconbtn sheetclose"
              aria-label="Close"
              onClick={() => setBookOpen(false)}
            >
              <Icon name="close" size={18} />
            </button>
            <h2>Book this class</h2>
            <p className="lead">
              Booking and payment happen on the studio&rsquo;s site, not on fittlist.
              We&rsquo;ll take you there.
            </p>
            <div className="bookout-links">
              {c.links.map((l, i) => (
                <a
                  key={i}
                  className="btn si evbtn"
                  href={l.url}
                  target="_blank"
                  rel="noopener nofollow"
                  onClick={() => setBookOpen(false)}
                >
                  Book via {l.label}
                  <Icon name="north_east" size={20} className="evbtn-ico" />
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
      {cardOpen && c && (
        <ShareCardSheet
          noThemes={!!c.image}
          path={`/api/card/class/${c.id}`}
          fileName={`fittlist-${c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`}
          title="Share this class"
          lead="A square image of the class, made for a post or a story. The link on it opens this page."
          alt={`${c.name} as a card`}
          linkUrl={c.shareUrl}
          linkTitle={c.name}
          onClose={() => setCardOpen(false)}
          onToast={(m) => toast(m)}
        />
      )}
      {adminAdder && c && (
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
          onToast={toast}
          onPublished={() => {
            setAdminAdder(null);
            toast("Saved");
            start(async () => {
              // The save deletes and reinserts the series' rows, so this
              // sheet's class id may be gone; a fresh lookup by the old id
              // failing just closes onto the page underneath.
              const fresh = await classDetail(lookupKey, classId, c.whenIso);
              if (fresh) setC(fresh);
              else onClose();
              onChanged?.(added);
            });
          }}
          onDeleted={(msg) => {
            setAdminAdder(null);
            toast(msg);
            onChanged?.(false);
            onClose();
          }}
        />
      )}
      {confirmKill && c && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmKill(false);
          }}
        >
          <div className="sheet confirmsheet">
            <h2>Delete this class?</h2>
            <p className="lead">
              The whole series comes off {c.coachName}&rsquo;s page, and anyone who marked a
              date gets told it&rsquo;s cancelled.
            </p>
            <div className="publishwrap nostick">
              <button className="btn si" disabled={pending} onClick={adminKill}>
                {pending ? "Deleting…" : "Delete class"}
              </button>
            </div>
            <button className="confirm-keep" disabled={pending} onClick={() => setConfirmKill(false)}>
              Keep it
            </button>
          </div>
        </div>
      )}
      {reportOpen && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setReportOpen(false);
          }}
        >
          <div className="sheet confirmsheet">
            <h2>What&rsquo;s wrong with it?</h2>
            <p className="lead">
              This goes to fittlist, not to the coach. If it checks out, nothing changes.
            </p>
            <div className="reportreasons">
              {/* The same four the row menu offers: two lists for one act
                  drift. "No longer running" took "Not at this gym"'s seat
                  because stale inventory is what reports actually catch. */}
              {["Not a real class", "No longer running", "Wrong time or place", "Something else"].map(
                (r) => (
                  <button
                    key={r}
                    className="btn ghost reportreason"
                    disabled={pending}
                    onClick={() => sendReport(r)}
                  >
                    {r}
                  </button>
                ),
              )}
            </div>
          </div>
        </div>
      )}
      {/* "It went somewhere": the note that answers the tap, up in the top
          third where the eye already is, with the way to the list it joined.
          It names that list, because the list has a name and it is the tab
          they will look for it on. */}
      <div className={`favtoast${favOn ? " on" : ""}`} aria-hidden={!favOn}>
        <Icon name="check_circle" size={18} />
        <span className="favtoast-t">Added to your week. Followers can see it.</span>
        <Link
          className="favtoast-link"
          href={c ? `/week?hl=${encodeURIComponent(`${c.id}.${c.whenIso}`)}` : "/week"}
          onClick={() => setFavOn(false)}
        >
          See them
        </Link>
      </div>
      <Toast msg={toastMsg} on={toastOn} />
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { classDetail, type ClassDetail } from "@/app/actions/classdetail";
import { setGoing } from "@/app/actions/going";
import { claimShift, giveUpShift } from "@/app/actions/gym";
import { reportClass } from "@/app/actions/reports";
import { Icon } from "@/components/Icon";
import { ShareCardSheet } from "@/components/ShareCardSheet";
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
  const [c, setC] = useState<ClassDetail | null>(initial ?? null);
  const [missing, setMissing] = useState(false);
  const [added, setAdded] = useState(initial?.added ?? false);
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
    classDetail(handle, classId, iso).then((d) => {
      if (!live) return;
      if (!d) {
        setMissing(true);
        return;
      }
      setC(d);
      setAdded(d.added);
    });
    return () => {
      live = false;
    };
  }, [handle, classId, iso, initial]);

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
      const fresh = await classDetail(handle, classId, iso);
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
  // Giving a date up and taking one are the same shape: one call, then reload
  // the sheet so it says what is true now rather than what was true.
  const act = (
    fn: (classId: string, occurrenceDate: string) => Promise<{ ok: boolean; error?: string }>,
    done: string,
  ) => {
    if (!c || shifting) return;
    startShift(async () => {
      const res = await fn(c.id, c.whenIso);
      if (!res.ok) {
        toast(res.error ?? "Couldn't do that");
        return;
      }
      toast(done);
      const fresh = await classDetail(handle, classId, c.whenIso);
      if (fresh) setC(fresh);
      onChanged?.(added);
    });
  };
  const isOwner = !!c?.roster;

  return (
    <div className="classoverlay">
      <button className="ovcircle ovcircle-back" aria-label={backLabel ?? "Back"} onClick={onClose}>
        <Icon name="arrow_back" size={19} />
      </button>
      {c && (
        <button className="ovcircle ovcircle-share" aria-label="Share this class" onClick={share}>
          <Icon name="ios_share" size={18} />
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
            <Icon name="more_horiz" size={18} />
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
                <Icon name="calendar_month" size={17} /> Add to Google Calendar
              </a>
              <a
                className="ovmenu-item"
                role="menuitem"
                href={c.icsHref}
                onClick={() => setMoreOpen(false)}
              >
                <Icon name="calendar_today" size={17} /> Add to Apple or Outlook
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
                <Icon name="auto_awesome" size={17} /> Share as an image
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
                  <Icon name="flag" size={17} /> Report this class
                </button>
              )}
            </div>
          )}
        </div>
      )}

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
          {c.classType && <span className="evtype classoverlay-type">{c.classType}</span>}
          <h2 className="classoverlay-nm">{c.name}</h2>
          {/* Whose class it is, as a face and a name, and a way to them: from
              the feed or your saves this is often the first time you meet a
              coach, and their name is the natural next tap.

              A gym gets no such row. It is a place rather than a person, it has
              no page at /{handle} to tap through to, and "coached by Ironbound
              Performance Athletics" is not true of anybody. The studio row
              below already says where, and who is teaching is the gym's own
              switch, which is off. */}
          {!c.ownerIsGym && (
          <Link className="classoverlay-coach" href={`/${c.handle}`}>
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
            <Icon name="chevron_right" size={16} />
          </Link>
          )}

          <div className="evfacts classoverlay-facts">
            <div className="evfact">
              <Icon name="event" size={20} />
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
                  <Icon name="place" size={20} />
                  <span className="evfact-txt">
                    <span className="t">{c.studioName}</span>
                    {c.studioAddress && <span className="s">{c.studioAddress}</span>}
                  </span>
                </Link>
              ) : (
                <div className="evfact">
                  <Icon name="place" size={20} />
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

          {/* Owner only: who added this occurrence. */}
          {c.roster && (
            <div className="classsheet-roster">
              <h3 className="classsheet-roster-h">
                Going{c.roster.length > 0 ? ` · ${c.roster.length}` : ""}
              </h3>
              <Roster people={c.roster} />
            </div>
          )}

          {/* The rota, from the coach's side. Whoever is on this date can hand
              it back; whoever teaches here can take it when nobody is. The
              manager never has to be in the middle of it, which is what the
              text message they send today was for. */}
          {c.shift && (
            <div className="shiftbox">
              <h3 className="ovsec-h">Your shift</h3>
              {c.shift.canGiveUp ? (
                <>
                  <p className="shiftbox-s">
                    You&rsquo;re on this one. Hand it back and the slot opens up; the gym and
                    everyone who could cover it are told.
                  </p>
                  <button
                    className="btn ghost shiftbox-btn"
                    disabled={shifting}
                    onClick={() => act(giveUpShift, "Handed back")}
                  >
                    {shifting ? "One moment…" : "I can't make this one"}
                  </button>
                </>
              ) : (
                <>
                  <p className="shiftbox-s">Nobody is on this one yet.</p>
                  <button
                    className="btn si shiftbox-btn"
                    disabled={shifting}
                    onClick={() => act(claimShift, "It's yours")}
                  >
                    {shifting ? "One moment…" : "I'll take it"}
                  </button>
                </>
              )}
            </div>
          )}

          {c.past && !added && <p className="classsheet-gone">This one has already run.</p>}

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

      {/* The floating pill: Book on the left, the calendar on the right. The
          owner's pill is their one action instead. */}
      {c && (isOwner || showBook || c.canAdd) && (
        <>
          <div className="classoverlay-cta">
            {isOwner ? (
              <Link className="ovcta-btn" href={`/app?edit=${c.id}&d=${c.whenIso}`}>
                <Icon name="edit" size={17} /> Edit this class
              </Link>
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
                    aria-label={added ? "In your plans" : "Add to your plans"}
                    onClick={toggle}
                  >
                    {/* An empty calendar, then the same calendar with the tick
                        cut into it. It was a heart, which said "favourite" and
                        meant "I'm going": the list it joins is Plans, and the
                        control should look like the place it puts things. */}
                    <Icon name={added ? "event_added" : "calendar_today"} size={19} />
                    {!added && "Add"}
                  </button>
                )}
              </>
            )}
          </div>
        </>
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
              <Icon name="close" size={16} />
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
                  <Icon name="north_east" size={18} className="evbtn-ico" />
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
      {cardOpen && c && (
        <ShareCardSheet
          path={`/api/card/class/${c.id}`}
          fileName={`fittlist-${c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`}
          title="Share this class"
          lead="A square image of the class, made for a post or a story. The link on it opens this page."
          alt={`${c.name} as a card`}
          onClose={() => setCardOpen(false)}
          onToast={(m) => toast(m)}
        />
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
              {["Not a real class", "Wrong time or place", "Not at this gym", "Something else"].map(
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
        <Icon name="event_added" size={16} />
        Added to your plans
        <Link className="favtoast-link" href="/week" onClick={() => setFavOn(false)}>
          See them
        </Link>
      </div>
      <Toast msg={toastMsg} on={toastOn} />
    </div>
  );
}

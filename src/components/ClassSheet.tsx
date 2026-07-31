"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { classDetail, type ClassDetail } from "@/app/actions/classdetail";
import { setGoing, setGoingCompanions } from "@/app/actions/going";
import { reportClass } from "@/app/actions/reports";
import { CompanionsEditor } from "@/components/CompanionsEditor";
import { Icon } from "@/components/Icon";
import { Roster } from "@/components/Roster";
import { TellSheet } from "@/components/TellSheet";
import { Toast, useToast } from "@/components/Toast";

// A class, from the bottom up.
//
// It used to be a full page, which meant tapping a row in a list threw the list
// away and the one thing you were there to do (add it) arrived after a
// navigation. A sheet keeps the list behind it, so adding reads as picking
// something up rather than going somewhere.
//
// The page at /{handle}/{classId} stays: a link somebody was sent has to open
// something real, and the share button here points at exactly that.
export function ClassSheet({
  handle,
  classId,
  iso,
  onClose,
  onChanged,
}: {
  handle: string;
  classId: string;
  /** The occurrence that was tapped, so a weekly class opens on the right day. */
  iso?: string;
  onClose: () => void;
  /** Fired after an add or a remove, so the list behind can catch up. */
  onChanged?: (added: boolean) => void;
}) {
  const [c, setC] = useState<ClassDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [added, setAdded] = useState(false);
  const [pending, start] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();
  const [canShareFiles, setCanShareFiles] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reported, setReported] = useState(false);
  const [tellOpen, setTellOpen] = useState(false);

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
    });
  };

  useEffect(() => {
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
  }, [handle, classId, iso]);

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
      // The second screen: who should know? Only on a fresh yes.
      if (next) setTellOpen(true);
    });
  };

  const share = async () => {
    if (!c) return;
    // The moment you commit is the moment you'd text a friend, so once
    // you're going the share carries the sentence, not just the link. The
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

  return (
    <div
      className="sheet-scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet classsheet">
        <button className="iconbtn sheetclose" aria-label="Close" onClick={onClose}>
          <Icon name="close" size={16} />
        </button>

        {missing ? (
          <p className="lead" style={{ marginTop: 10 }}>
            That class isn&rsquo;t there any more.
          </p>
        ) : !c ? (
          // A blank beat rather than a spinner: the sheet is already open and
          // the data lands in a moment.
          <div className="classsheet-wait" aria-hidden="true" />
        ) : (
          <>
            {c.classType && <span className="evtype">{c.classType}</span>}
            <h2 className="classsheet-nm">{c.name}</h2>
            {/* Whose class it is, as a face and a name, and a way to them:
                from the feed or your week this sheet is often the first time
                you meet a coach, and their name is the natural next tap. */}
            <Link className="classsheet-who" href={`/${c.handle}`}>
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
              {c.coachName}
              <Icon name="chevron_right" size={16} />
            </Link>

            <div className="evfacts classsheet-facts">
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

            {c.description?.trim() && (
              // Four lines, then Read more. A coach who writes a paragraph about
              // their class pushed the add button off the bottom of the sheet,
              // which is the one thing the sheet is for.
              <div className={`classsheet-descwrap${moreOpen ? " open" : ""}`}>
                <p className="evdesc classsheet-desc">{c.description}</p>
                {!moreOpen && (
                  <button className="descmore" onClick={() => setMoreOpen(true)}>
                    Read more
                  </button>
                )}
              </div>
            )}

            {/* Owner only: who marked Going on this occurrence. */}
            {c.roster && (
              <div className="classsheet-roster">
                <h3 className="classsheet-roster-h">
                  Going{c.roster.length > 0 ? ` · ${c.roster.length}` : ""}
                </h3>
                <Roster people={c.roster} />
              </div>
            )}

            {/* The room introducing itself early: the other people coming,
                shown only because this viewer is coming too. Non-null and
                non-empty is the server saying both of those things. */}
            {c.alsoGoing && c.alsoGoing.length > 0 && (
              <div className="classsheet-roster">
                <h3 className="classsheet-roster-h">Also going · {c.alsoGoing.length}</h3>
                <Roster people={c.alsoGoing} />
              </div>
            )}

            {c.links.length > 0 && (
              <div className="evbook classsheet-book">
                {c.links.map((l, i) => (
                  <a
                    key={i}
                    className="btn ghost evbtn"
                    href={l.url}
                    target="_blank"
                    rel="noopener nofollow"
                  >
                    Book via {l.label}
                    <Icon name="north_east" size={18} className="evbtn-ico" />
                  </a>
                ))}
              </div>
            )}

            {/* The add is the point of the sheet, so it gets the footer. Share
                sits beside it: passing a class to someone is the other thing
                you'd want to do from here, and it links at the real page. */}
            <div className="publishwrap classsheet-do">
              {c.past && !added && (
                <p className="classsheet-gone">This one has already run.</p>
              )}
              {/* The owner's one action. The roster being non-null is the
                  server saying this viewer owns the class. */}
              {c.roster && (
                <Link className="classsheet-add classsheet-edit" href={`/app?edit=${c.id}&d=${c.whenIso}`}>
                  <Icon name="edit" size={18} /> Edit this class
                </Link>
              )}
              {c.canAdd && (
                <button
                  className={`classsheet-add${added ? " on" : ""}`}
                  disabled={pending}
                  onClick={toggle}
                >
                  {added ? (
                    <>
                      <Icon name="check" size={18} /> Added to your week
                    </>
                  ) : (
                    "Add to your week"
                  )}
                </button>
              )}
              <button className={`classsheet-share${added ? " invite" : ""}`} onClick={share}>
                <Icon name={added ? "campaign" : "ios_share"} size={18} />
                {added ? "Tell someone you're going" : "Share this class"}
              </button>
              {/* Names, not accounts: Joanne doesn't need the app to count. */}
              {added && (
                <CompanionsEditor
                  value={c.myCompanions}
                  onSave={async (names) => {
                    const res = await setGoingCompanions(c.id, c.whenIso, names);
                    if (!res.ok) {
                      toast(res.error ?? "Something went wrong");
                      return null;
                    }
                    return res.companions ?? [];
                  }}
                />
              )}
              {/* Quiet on purpose: a moderation control shouldn't compete with
                  the add button, but it has to exist, because a class that
                  isn't real is somebody else's wasted trip. */}
              {c.canAdd && !reported && (
                <button className="classsheet-report" onClick={() => setReportOpen(true)}>
                  Report this class
                </button>
              )}
              {reported && <p className="classsheet-reported">Thanks. We&rsquo;ll take a look.</p>}
            </div>
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
          </>
        )}
      </div>
      {c && (
        <TellSheet
          open={tellOpen}
          onClose={() => setTellOpen(false)}
          name={c.name}
          dateLong={c.dateLong}
          shareUrl={c.myHandle ? `${c.shareUrl}&g=${c.myHandle}` : c.shareUrl}
          canAnnounce={c.canAnnounce || added}
          classId={c.id}
          whenIso={c.whenIso}
          onToast={toast}
        />
      )}
      <Toast msg={toastMsg} on={toastOn} />
    </div>
  );
}

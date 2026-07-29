"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { classDetail, type ClassDetail } from "@/app/actions/classdetail";
import { setGoing } from "@/app/actions/going";
import { Icon } from "@/components/Icon";
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
    });
  };

  const share = async () => {
    if (!c) return;
    try {
      if (canShareFiles) {
        await navigator.share({ title: c.name, url: c.shareUrl });
        return;
      }
      await navigator.clipboard.writeText(c.shareUrl);
      toast("Link copied, ready to paste");
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
            {/* Whose class it is, as a face and a name. Not a link: you got
                here from their schedule, and a sheet that can navigate away is
                a sheet you have to find your way back into. */}
            <div className="classsheet-who">
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
            </div>

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
              <button className="classsheet-share" onClick={share}>
                <Icon name="ios_share" size={18} /> Share this class
              </button>
            </div>
          </>
        )}
      </div>
      <Toast msg={toastMsg} on={toastOn} />
    </div>
  );
}

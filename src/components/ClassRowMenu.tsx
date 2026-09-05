"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { FittlistShareSheet } from "@/components/InAppShare";
import { ShareCardSheet } from "@/components/ShareCardSheet";
import { Toast } from "@/components/Toast";
import { reportClass } from "@/app/actions/reports";

// The dots on a class row, everywhere one is listed: Following, a coach's
// page, a studio's page. Three things a reader does with somebody else's
// class: hand it on, put it on their own device calendar, and say it isn't
// right. The last one is the stale-inventory loop: a directory kept by the
// people reading it, which is the commons' whole deal, and the reason the
// button is on the row rather than buried in the class sheet where nobody
// browsing a wrong listing would find it.
//
// It is a sibling of the row, never a child, because a button inside a link
// is not a thing (the remove X learned this first). Callers wrap both in
// `.clrow` so the dots have a corner to sit in.
export type ClassRowMenuProps = {
  classId: string;
  /** The class page's base: a handle, or `s/{slug}` for a gym's class. */
  base: string;
  iso: string;
  name: string;
  /** Off on your own rows: reporting your own class is a button that can
   *  only ever answer with an error. */
  canReport?: boolean;
  /** Opens the class over the list (Following's peek). Without it the
   *  details row navigates to the class page, which is the same answer on
   *  a screen with no sheet of its own. */
  onDetails?: () => void;
  /** Whose class it is, where that isn't the page you're already on. */
  coach?: { name: string; href: string } | null;
  /** Where it is, where that isn't the page you're already on. */
  studio?: { name: string; href: string } | null;
};

export function ClassRowMenu({
  classId,
  base,
  iso,
  name,
  canReport = true,
  onDetails,
  coach,
  studio,
}: ClassRowMenuProps) {
  const [open, setOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [pending, start] = useTransition();
  // Not useToast: that renders its element permanently, and this component
  // is on every row of a long list, which put a fixed-position live region
  // per class in the DOM (and broke every suite that locates ".toast" as a
  // single thing). The element mounts only while it speaks.
  const [toastMsg, setToastMsg] = useState("");
  const [toastOn, setToastOn] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const toast = (m: string) => {
    timers.current.forEach(clearTimeout);
    setToastMsg(m);
    setToastOn(true);
    timers.current = [
      setTimeout(() => setToastOn(false), 2600),
      setTimeout(() => setToastMsg(""), 3300),
    ];
  };

  // The ics route addresses a gym's class by the bare slug; the /s/ prefix
  // belongs to the page URL, not the lookup.
  const icsBase = base.startsWith("s/") ? base.slice(2) : base;
  const pagePath = `/${base}/${classId}?d=${iso}`;

  const sendReport = (reason: string) => {
    if (pending) return;
    start(async () => {
      const res = await reportClass(classId, reason);
      setReporting(false);
      setOpen(false);
      if (!res.ok) {
        toast(res.error ?? "Couldn't send that");
        return;
      }
      toast("Thanks. We'll take a look.");
    });
  };

  return (
    <>
      <button
        type="button"
        className="clmore"
        aria-label={`More for ${name}`}
        onClick={() => setOpen(true)}
      >
        <Icon name="more_horiz" size={20} />
      </button>

      {open && !reporting && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="sheet rowmenu">
            <button className="iconbtn sheetclose sheet-dismiss" aria-label="Close" onClick={() => setOpen(false)}>
              <Icon name="close" size={20} />
            </button>
            <h2>{name}</h2>
            <div className="settingslist">
              {/* The places first, then the acts: what this is and whose,
                  then what to do with it. */}
              {onDetails ? (
                <button
                  className="setrow"
                  onClick={() => {
                    setOpen(false);
                    onDetails();
                  }}
                >
                  <span className="setrow-ic">
                    <Icon name="event" size={20} />
                  </span>
                  <span className="setrow-txt">
                    <span className="t">Class details</span>
                  </span>
                </button>
              ) : (
                <Link className="setrow" href={pagePath}>
                  <span className="setrow-ic">
                    <Icon name="event" size={20} />
                  </span>
                  <span className="setrow-txt">
                    <span className="t">Class details</span>
                  </span>
                </Link>
              )}
              {coach && (
                <Link className="setrow" href={coach.href}>
                  <span className="setrow-ic">
                    <Icon name="account_circle" size={20} />
                  </span>
                  <span className="setrow-txt">
                    <span className="t">Coach&rsquo;s profile</span>
                    <span className="s">{coach.name}</span>
                  </span>
                </Link>
              )}
              {studio && (
                <Link className="setrow" href={studio.href}>
                  <span className="setrow-ic">
                    <Icon name="place" size={20} />
                  </span>
                  <span className="setrow-txt">
                    <span className="t">Studio page</span>
                    <span className="s">{studio.name}</span>
                  </span>
                </Link>
              )}
              <button className="setrow" onClick={() => { setOpen(false); setShareOpen(true); }}>
                <span className="setrow-ic">
                  <Icon name="share" size={20} />
                </span>
                <span className="setrow-txt">
                    <span className="t">Share class</span>
                </span>
              </button>
              <a
                className="setrow"
                href={`/api/cal/${icsBase}/${classId}`}
                download
                onClick={() => setOpen(false)}
              >
                <span className="setrow-ic">
                  <Icon name="event_added" size={20} />
                </span>
                <span className="setrow-txt">
                  <span className="t">Add to calendar</span>
                  <span className="s">Apple, Google or Outlook, as a calendar file.</span>
                </span>
              </a>
              {canReport && (
                <button className="setrow" onClick={() => setReporting(true)}>
                  <span className="setrow-ic">
                    <Icon name="flag" size={20} />
                  </span>
                  <span className="setrow-txt">
                    <span className="t">Report this class</span>
                    <span className="s">Not running any more, or listed wrong.</span>
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {shareOpen && (
        <FittlistShareSheet
          title={name}
          url={`${window.location.origin}${pagePath}`}
          onShareImage={() => {
            setShareOpen(false);
            setCardOpen(true);
          }}
          onClose={() => setShareOpen(false)}
          onToast={toast}
        />
      )}

      {cardOpen && (
        <ShareCardSheet
          path={`/api/card/class/${classId}?d=${encodeURIComponent(iso)}`}
          fileName={`fittlist-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`}
          title="Share this class"
          lead="A square picture of the class, made for sharing."
          alt={`${name} as a card`}
          linkUrl={`${window.location.origin}${pagePath}`}
          linkTitle={name}
          onClose={() => setCardOpen(false)}
          onToast={toast}
        />
      )}

      {open && reporting && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setReporting(false);
              setOpen(false);
            }
          }}
        >
          {/* The same words the class sheet's report uses, because it is the
              same act: this goes to fittlist, and a report that checks out is
              how a class a coach walked away from comes off the shelf. */}
          <div className="sheet confirmsheet">
            <h2>What&rsquo;s wrong with it?</h2>
            <p className="lead">
              This goes to fittlist, not to the coach. If it checks out, nothing changes.
            </p>
            <div className="reportreasons">
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

      {toastMsg && <Toast msg={toastMsg} on={toastOn} />}
    </>
  );
}

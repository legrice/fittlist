"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/Icon";
import { StudioOwnerBar, type StudioEditProps } from "@/components/StudioOwnerBar";
import { Toast, useToast } from "@/components/Toast";

// Everything about running a studio that isn't already a control on the
// shifts screen. It used to float on the studio's public page, which put a
// manager's tools on the page strangers read; the way in is the You tab now,
// and this is the overflow beside the two buttons there, holding what those
// buttons don't: the counts, the editor, the share, and the page's views.
export function StudioAdminSheet({
  slug,
  canSchedule,
  pageViews,
  studio,
}: {
  slug: string;
  /** The gym account is on, so the rota and the counts exist to link to. */
  canSchedule: boolean;
  /** All-time page views, tracked against the gym's account. Null when there
   *  is no account to track against yet. */
  pageViews: number | null;
  studio: StudioEditProps;
}) {
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [toastMsg, toastOn, toast] = useToast();

  const share = async () => {
    setOpen(false);
    const url = `${window.location.origin}/s/${slug}`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: `${studio.name} on fittlist`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast("Link copied");
    } catch {
      // a dismissed share sheet is not an error
    }
  };

  return (
    <>
      <button
        className="btn ghost staffbar-b staffmore"
        aria-label="More studio settings"
        onClick={() => setOpen(true)}
      >
        <Icon name="more_horiz" size={18} />
      </button>

      {open && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="sheet">
            <button className="iconbtn sheetclose" aria-label="Close" onClick={() => setOpen(false)}>
              <Icon name="close" size={16} />
            </button>
            <h2>Studio admin</h2>
            {/* The number a studio actually asks about first: is anyone
                looking. A stat is a row you read, not a door, so no chevron. */}
            {pageViews !== null && (
              <div className="statgrid">
                <div className="stat">
                  <div className="n">{pageViews}</div>
                  <div className="l">Page views</div>
                </div>
              </div>
            )}
            <div className="settingslist ownermenu">
              {canSchedule && (
                <Link className="setrow" href={`/s/${slug}/manage/counts`}>
                  <span className="setrow-ic"><Icon name="event_available" size={22} /></span>
                  <span className="setrow-txt">
                    <span className="t">Shifts worked</span>
                    <span className="s">Counted from the schedule, split for a pay run</span>
                  </span>
                  <span className="setrow-chev"><Icon name="chevron_right" size={20} /></span>
                </Link>
              )}
              <button
                className="setrow"
                onClick={() => {
                  setOpen(false);
                  setEditOpen(true);
                }}
              >
                <span className="setrow-ic"><Icon name="edit" size={22} /></span>
                <span className="setrow-txt">
                  <span className="t">Edit studio info</span>
                  <span className="s">Photo, address, what it offers, contact</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={20} /></span>
              </button>
              <button className="setrow" onClick={share}>
                <span className="setrow-ic"><Icon name="ios_share" size={22} /></span>
                <span className="setrow-txt">
                  <span className="t">Share this studio</span>
                  <span className="s">Hand its page to someone</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={20} /></span>
              </button>
            </div>
          </div>
        </div>
      )}

      <StudioOwnerBar open={editOpen} onClose={() => setEditOpen(false)} {...studio} />
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}

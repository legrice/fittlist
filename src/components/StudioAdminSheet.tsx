"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setStudioShiftApproval, studioPageViews } from "@/app/actions/gym";
import { setStudioShowCoaches } from "@/app/actions/studios";
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
  showCoaches = true,
  approvalOn = true,
}: {
  slug: string;
  /** The gym account is on, so the rota and the counts exist to link to. */
  canSchedule: boolean;
  /** All-time page views, tracked against the gym's account. Null when there
   *  is no account to track against yet. */
  pageViews?: number | null;
  studio: StudioEditProps;
  /** Whether the public schedule names who is coaching. On by default for a
   *  verified studio; the switch below is the way off. */
  showCoaches?: boolean;
  /** Whether coach-initiated covers and permanent transfers wait for a manager. */
  approvalOn?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [names, setNames] = useState(showCoaches);
  const [approvals, setApprovals] = useState(approvalOn);
  const [views, setViews] = useState<number | null | undefined>(pageViews);
  const [viewsPending, startViews] = useTransition();
  const [, startNames] = useTransition();
  const [, startApprovals] = useTransition();
  const router = useRouter();
  const [toastMsg, toastOn, toast] = useToast();

  const toggleNames = () => {
    const next = !names;
    setNames(next);
    startNames(async () => {
      const res = await setStudioShowCoaches(studio.id, next);
      if (!res.ok) {
        setNames(!next);
        toast(res.error ?? "Couldn't save that");
        return;
      }
      router.refresh();
    });
  };

  const toggleApprovals = () => {
    const next = !approvals;
    setApprovals(next);
    startApprovals(async () => {
      const res = await setStudioShiftApproval(studio.id, next);
      if (!res.ok) {
        setApprovals(!next);
        toast(res.error ?? "Couldn't save that");
        return;
      }
      router.refresh();
    });
  };

  const openAdmin = () => {
    setOpen(true);
    if (!canSchedule || views !== undefined || viewsPending) return;
    startViews(async () => {
      const result = await studioPageViews(studio.id);
      if (!result.ok) {
        setViews(null);
        return;
      }
      setViews(result.pageViews);
    });
  };

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
        onClick={openAdmin}
      >
        <Icon name="more_horiz" size={20} />
      </button>

      {open && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="sheet studio-admin-sheet">
            <button className="iconbtn sheetclose" aria-label="Close" onClick={() => setOpen(false)}>
              <Icon name="close" size={18} />
            </button>
            <h2>Studio admin</h2>
            {/* The number a studio actually asks about first: is anyone
                looking. A stat is a row you read, not a door, so no chevron. */}
            {canSchedule && views === undefined && (
              <div className="statgrid" aria-label="Loading page views">
                <div className="stat">
                  <div className="n">&ndash;</div>
                  <div className="l">Page views</div>
                </div>
              </div>
            )}
            {views !== null && views !== undefined && (
              <div className="statgrid">
                <div className="stat">
                  <div className="n">{views}</div>
                  <div className="l">Page views</div>
                </div>
              </div>
            )}
            <div className="settingslist ownermenu">
              {canSchedule && (
                <Link className="setrow" href={`/s/${slug}/manage/counts`}>
                  <span className="setrow-ic"><Icon name="event_available" size={24} /></span>
                  <span className="setrow-txt">
                    <span className="t">Shift counter</span>
                    <span className="s">Counted from the schedule, split for a pay run</span>
                  </span>
                  <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
                </Link>
              )}
              <button
                className="setrow"
                onClick={() => {
                  setOpen(false);
                  setEditOpen(true);
                }}
              >
                <span className="setrow-ic"><Icon name="edit" size={24} /></span>
                <span className="setrow-txt">
                  <span className="t">Edit studio info</span>
                  <span className="s">Photo, address, what it offers, contact</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
              </button>
              <button className="setrow" onClick={share}>
                <span className="setrow-ic"><Icon name="ios_share" size={24} /></span>
                <span className="setrow-txt">
                  <span className="t">Share this studio</span>
                  <span className="s">Hand its page to someone</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
              </button>
              {/* Whether the public week is a roster: some gyms publish a
                  schedule without naming anybody, and that is theirs to
                  decide. Only meaningful once the gym runs its schedule. */}
              {canSchedule && (
                <button className="setrow" onClick={toggleApprovals} aria-pressed={approvals}>
                  <span className="setrow-ic"><Icon name="verified" size={24} /></span>
                  <span className="setrow-txt">
                    <span className="t">Approve shift changes</span>
                    <span className="s">
                      {approvals
                        ? "Covers and permanent transfers wait for a manager"
                        : "Coaches can make covers and permanent transfers directly"}
                    </span>
                  </span>
                  <span className={`switch${approvals ? " on" : ""}`} aria-hidden="true">
                    <span className="switch-knob" />
                  </span>
                </button>
              )}
              {canSchedule && (
                <button className="setrow" onClick={toggleNames} aria-pressed={names}>
                  <span className="setrow-ic"><Icon name="groups" size={24} /></span>
                  <span className="setrow-txt">
                    <span className="t">Show who&rsquo;s coaching</span>
                    <span className="s">
                      {names
                        ? "Coach names appear on the public schedule"
                        : "The schedule lists classes without names"}
                    </span>
                  </span>
                  <span className={`switch${names ? " on" : ""}`} aria-hidden="true">
                    <span className="switch-knob" />
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <StudioOwnerBar open={editOpen} onClose={() => setEditOpen(false)} {...studio} />
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}

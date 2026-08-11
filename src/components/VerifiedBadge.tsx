"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";
import { StudioFeedback } from "@/components/StudioFeedback";
import { Toast, useToast } from "@/components/Toast";

// The Managed badge, its Community listing sibling, and what each means on a tap.
//
// A badge nobody can ask about is a claim people have to take on faith, and
// These are doing real work: Managed is why the pencil is gone for everyone
// else, and Community listing is why it is not. Public spaces are the third
// honest state: shared forever, because a park is not an organization to own.
//
// The way in is the Claim this place sheet: an ask to take the keys, not a
// correction form, because wanting to run your page is not a suggestion. It
// rides the same pipe a suggestion does, marked by its first line.
export function VerifiedBadge({
  studioId,
  name,
  verified = true,
  claimable = true,
}: {
  studioId: string;
  name: string;
  verified?: boolean;
  claimable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [claim, setClaim] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [toastMsg, toastOn, toast] = useToast();

  useEffect(() => setMounted(true), []);

  return (
    <>
      {/* Only Managed wears the check: the mark means a real team has the
          keys. Community and public listings are words alone. */}
      <button
        className={`kindtag studiokept${verified ? "" : " studiokept-un"}`}
        onClick={() => setOpen(true)}
        aria-label={verified ? "What Managed means" : claimable ? "What Community listing means" : "What Public space means"}
      >
        {verified && <Icon name="verified" size={15} />} {verified ? "Managed" : claimable ? "Community listing" : "Public space"}
      </button>

      {open &&
        mounted &&
        createPortal(
          <div
            className="sheet-scrim"
            onClick={(e) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
          >
            <div className="sheet infosheet">
              <button
                className="iconbtn sheetclose"
                aria-label="Close"
                onClick={() => setOpen(false)}
              >
                <Icon name="close" size={18} />
              </button>
              {verified ? (
                <>
                  <h2 style={{ marginTop: 10 }}>Managed</h2>
                  <p className="lead">
                    This page is managed by the organization, so the schedule and details come
                    directly from the people who run it.
                  </p>
                </>
              ) : claimable ? (
                <>
                  <h2 style={{ marginTop: 10 }}>Community listing</h2>
                  <p className="lead">
                    This page is community-managed. Coaches and members can update it so
                    schedules and details stay accurate.
                  </p>
                  <p className="lead">
                    If you run or organize {name}, you can claim this place. Once it is managed, only
                    you and people on your team can edit it, and everyone will know the
                    information comes directly from you.
                  </p>
                </>
              ) : (
                <>
                  <h2 style={{ marginTop: 10 }}>Public space</h2>
                  <p className="lead">
                    This is a shared location, not an organization to own. Anyone can add fitness
                    events here, but the place itself cannot be claimed.
                  </p>
                </>
              )}
              {!verified && claimable && <div className="publishwrap">
                <button
                  className="btn si"
                  onClick={() => {
                    setOpen(false);
                    setClaim(true);
                  }}
                >
                  Claim this place
                </button>
              </div>}
            </div>
          </div>,
          document.body,
        )}

      <StudioFeedback
        studioId={studioId}
        mode={claim ? "claim" : null}
        onClose={() => setClaim(false)}
        onDone={(msg) => {
          setClaim(false);
          toast(msg);
        }}
      />
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}

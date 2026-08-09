"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";
import { StudioFeedback } from "@/components/StudioFeedback";
import { Toast, useToast } from "@/components/Toast";

// The Verified badge, its Unverified sibling, and what each means on a tap.
//
// A badge nobody can ask about is a claim people have to take on faith, and
// these are doing real work: Verified is why the pencil is gone for everyone
// else, and Unverified is why it isn't. So each says what it means, and both
// say how a gym gets the keys, because the person most likely to tap either
// is somebody who runs a place and wants theirs.
//
// The way in is the Own this page sheet: an ask to take the keys, not a
// correction form, because wanting to run your page is not a suggestion. It
// rides the same pipe a suggestion does, marked by its first line.
export function VerifiedBadge({
  studioId,
  name,
  verified = true,
}: {
  studioId: string;
  name: string;
  verified?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [claim, setClaim] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [toastMsg, toastOn, toast] = useToast();

  useEffect(() => setMounted(true), []);

  return (
    <>
      {/* Only Verified wears the check: the mark means the claim was made
          good, and drawing it beside Unverified said the opposite of the
          word. Unverified is the word alone, in ink. */}
      <button
        className={`kindtag studiokept${verified ? "" : " studiokept-un"}`}
        onClick={() => setOpen(true)}
        aria-label={verified ? "What Verified means" : "What Unverified means"}
      >
        {verified && <Icon name="verified" size={15} />} {verified ? "Verified" : "Unverified"}
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
                  <h2 style={{ marginTop: 10 }}>Verified</h2>
                  <p className="lead">
                    This page is managed by the studio, so the schedule and details come
                    directly from the people who run it.
                  </p>
                  <p className="lead">
                    <strong>Run a studio? Verify yours to take ownership of your page.</strong>
                  </p>
                </>
              ) : (
                <>
                  <h2 style={{ marginTop: 10 }}>Unverified</h2>
                  <p className="lead">
                    This page is community-managed. Coaches and members can update it so
                    schedules and details stay accurate.
                  </p>
                  <p className="lead">
                    If you run or manage {name}, you can verify this page. Once verified, only
                    you and admins on your team can edit it, and everyone will know the
                    information comes directly from you.
                  </p>
                  <p className="lead">
                    <strong>Run {name}? We&rsquo;d love to verify your page.</strong>
                  </p>
                </>
              )}
              <div className="publishwrap">
                <button
                  className="btn si"
                  onClick={() => {
                    setOpen(false);
                    setClaim(true);
                  }}
                >
                  Get in touch
                </button>
              </div>
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

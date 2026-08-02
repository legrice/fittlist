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
      <button
        className="kindtag studiokept"
        onClick={() => setOpen(true)}
        aria-label={verified ? "What Verified means" : "What Unverified means"}
      >
        <Icon name="verified" size={13} /> {verified ? "Verified" : "Unverified"}
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
            <div className="sheet">
              <button
                className="iconbtn sheetclose"
                aria-label="Close"
                onClick={() => setOpen(false)}
              >
                <Icon name="close" size={16} />
              </button>
              {verified ? (
                <>
                  <h2 style={{ marginTop: 10 }}>Verified</h2>
                  <p className="lead">
                    The people who run {name} keep this page. They write the details and they
                    answer for what it says, which is why nobody else can edit it.
                  </p>
                  <p className="lead">
                    Every other studio in fittlist is a shared entry: any coach can correct one,
                    because a page nobody owns is better kept right by the people who teach there
                    than left wrong.
                  </p>
                  <p className="lead">
                    Run a studio? Tell us and we&rsquo;ll hand you the keys to yours: your own
                    schedule, your own details, and this badge on it.
                  </p>
                </>
              ) : (
                <>
                  <h2 style={{ marginTop: 10 }}>Unverified</h2>
                  <p className="lead">
                    This page is a shared entry. The coaches and members who train at {name} keep
                    it, and any coach can correct it, because a page nobody owns is better kept
                    right by the people who use it than left wrong.
                  </p>
                  <p className="lead">
                    Verifying hands the keys to the people who run the place: your own schedule,
                    your own details, and only you can edit them. The page wears Verified so
                    everyone knows who speaks for it.
                  </p>
                  <p className="lead">Run {name}? Tell us and we&rsquo;ll set you up.</p>
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

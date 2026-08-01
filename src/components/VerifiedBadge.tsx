"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";
import { StudioFeedback } from "@/components/StudioFeedback";
import { Toast, useToast } from "@/components/Toast";

// The Verified studio badge, and what it means when you tap it.
//
// A badge nobody can ask about is a claim people have to take on faith, and
// this one is doing real work: it is why the pencil is gone for everyone else.
// So it says what it means, and it says how a gym gets one, because the person
// most likely to tap it is somebody who runs a place and wants theirs.
//
// The way in is the Suggest an edit sheet that already exists, whose relation
// field starts with "I own it". That is how a studio actually gets claimed
// today, so this points at it rather than inventing a second door.
export function VerifiedBadge({ studioId, name }: { studioId: string; name: string }) {
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
        aria-label="What Verified studio means"
      >
        <Icon name="verified" size={13} /> Verified studio
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
              <h2 style={{ marginTop: 10 }}>Verified studio</h2>
              <p className="lead">
                The people who run {name} keep this page. They write the details and they answer
                for what it says, which is why nobody else can edit it.
              </p>
              <p className="lead">
                Every other studio in fittlist is a shared entry: any coach can correct one, because
                a page nobody owns is better kept right by the people who teach there than left
                wrong.
              </p>
              <p className="lead">
                Run a studio? Tell us and we&rsquo;ll hand you the keys to yours: your own schedule,
                your own details, and this badge on it.
              </p>
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
        mode={claim ? "suggest" : null}
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

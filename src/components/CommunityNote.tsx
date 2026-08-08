"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";
import { StudioFeedback } from "@/components/StudioFeedback";
import { Toast, useToast } from "@/components/Toast";

// The community schedule's info dot, beside the Schedule tab.
//
// The note used to sit as a paragraph over the week itself, read once and
// scrolled past forever after. It is a tap away now: the dot says there is
// something to know, the sheet says it, and the same Get in touch leads into
// the Own this page ask the badge's sheet uses, because the person most
// likely to open this is somebody who runs the place.
export function CommunityNote({ studioId, name }: { studioId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [claim, setClaim] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [toastMsg, toastOn, toast] = useToast();

  useEffect(() => setMounted(true), []);

  return (
    <>
      <button
        className="pubtab-info"
        aria-label="About this schedule"
        onClick={() => setOpen(true)}
      >
        <Icon name="info" size={20} />
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
              <h2 style={{ marginTop: 10 }}>This schedule</h2>
              <p className="lead">
                Built by coaches and members who train here. Claim this page to take over
                your studio&rsquo;s schedule and details.
              </p>
              <p className="lead">
                <strong>Run {name}? We&rsquo;d love to verify your page.</strong>
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

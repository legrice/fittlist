"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";
import { StudioFeedback } from "@/components/StudioFeedback";
import { Toast, useToast } from "@/components/Toast";

// The community schedule's disclaimer, directly above the week.
//
// The note used to sit as a paragraph over the week itself, read once and
// scrolled past forever after. The short line says what matters without a
// detour; More opens the context, and the same claim action leads into
// the place claim ask the badge's sheet uses, because the person most
// likely to open this is somebody who runs the place.
export function CommunityNote({ studioId, name, claimable = true }: { studioId: string; name: string; claimable?: boolean }) {
  const [open, setOpen] = useState(false);
  const [claim, setClaim] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [toastMsg, toastOn, toast] = useToast();

  useEffect(() => setMounted(true), []);

  return (
    <>
      <div className="community-schedule-note">
        <p>Built by coaches and members who train here.</p>
        <button type="button" onClick={() => setOpen(true)}>More</button>
      </div>

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
                Built by coaches and members who train here.
              </p>
              {claimable ? <p className="lead">
                <strong>Run or organize {name}? Claim this place to manage its schedule and details.</strong>
              </p> : <p className="lead">This public space stays shared, so nobody owns its page.</p>}
              {claimable && <div className="publishwrap">
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

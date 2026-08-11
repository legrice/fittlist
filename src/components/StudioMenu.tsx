"use client";

import { useState } from "react";
import { BodyPortal } from "@/components/BodyPortal";
import { Icon } from "@/components/Icon";
import { StudioFeedback } from "@/components/StudioFeedback";
import { StudioOwnerBar, type StudioEditProps } from "@/components/StudioOwnerBar";
import { Toast, useToast } from "@/components/Toast";

/** Studio utilities shown directly in the horizontal profile action rail. */
export function StudioMenu({ canEdit, claimed, signedIn, studio }: {
  slug: string;
  canEdit: boolean;
  claimed: boolean;
  signedIn: boolean;
  studio: StudioEditProps;
}) {
  const [mindfulOpen, setMindfulOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [feedback, setFeedback] = useState<null | "report" | "suggest" | "optout" | "claim">(null);
  const [toastMsg, toastOn, toast] = useToast();
  return (
    <>
      {canEdit && <button className="actpill" onClick={() => setMindfulOpen(true)}><Icon name="edit" size={18} /> Edit</button>}
      {!claimed && <button className="actpill" onClick={() => setFeedback("claim")}><Icon name="verified" size={18} /> Claim</button>}
      <button className="actpill" onClick={() => setFeedback("suggest")}><Icon name="chat_bubble" size={18} /> Suggest edit</button>
      {signedIn && <button className="actpill" onClick={() => setFeedback("report")}><Icon name="flag" size={18} /> Report</button>}
      <button className="actpill" onClick={() => setFeedback("optout")}><Icon name="public_off" size={18} /> Take down</button>

      <BodyPortal>
        {mindfulOpen && (
          <div className="sheet-scrim" onClick={(e) => { if (e.target === e.currentTarget) setMindfulOpen(false); }}>
            <div className="sheet confirmsheet">
              <h2>Before you edit</h2>
              <p className="lead">This page is shared: every coach and member who relies on it sees what you save. Edits go live at once and are logged with your name. Make the page more true than you found it, and leave the rest alone.</p>
              <div className="publishwrap nostick"><button className="btn si" onClick={() => { setMindfulOpen(false); setEditOpen(true); }}>Continue to edit</button></div>
              <button className="tertiary tellsheet-done" onClick={() => setMindfulOpen(false)}>Not now</button>
            </div>
          </div>
        )}
        {canEdit && <StudioOwnerBar open={editOpen} onClose={() => setEditOpen(false)} {...studio} />}
        <StudioFeedback studioId={studio.id} mode={feedback} onClose={() => setFeedback(null)} onDone={toast} />
        <Toast msg={toastMsg} on={toastOn} />
      </BodyPortal>
    </>
  );
}

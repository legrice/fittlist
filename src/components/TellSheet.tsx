"use client";

import { useState, useTransition } from "react";
import { announceGoing } from "@/app/actions/going";
import { Icon } from "@/components/Icon";

// The second screen after "I'm going": who should know? Two doors, both
// yours to open. In the app, a deliberate note to your mutuals; outside it,
// the text message that carries the poster with your name on it. Neither
// happens on its own, and closing the sheet does nothing at all.
export function TellSheet({
  open,
  onClose,
  name,
  dateLong,
  shareUrl,
  canAnnounce,
  classId,
  whenIso,
  onToast,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  dateLong: string;
  /** Carries ?g={handle} so the poster says who's going. */
  shareUrl: string;
  canAnnounce: boolean;
  classId: string;
  whenIso: string;
  onToast: (msg: string) => void;
}) {
  const [announced, setAnnounced] = useState(false);
  const [pending, start] = useTransition();

  const announce = () =>
    start(async () => {
      const res = await announceGoing(classId, whenIso);
      if (!res.ok) {
        onToast(res.error ?? "Something went wrong");
        return;
      }
      setAnnounced(true);
    });

  const text = async () => {
    const sentence = `I'm going to ${name} on ${dateLong}. Come with me:`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: name, text: sentence, url: shareUrl });
        return;
      }
      await navigator.clipboard.writeText(`${sentence} ${shareUrl}`);
      onToast("Invite copied, ready to paste");
    } catch {
      // a dismissed share sheet is not an error
    }
  };

  if (!open) return null;
  return (
    <div
      className="sheet-scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet tellsheet">
        <button className="iconbtn sheetclose" aria-label="Close" onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
        <h2 style={{ marginTop: 10 }}>You&rsquo;re in</h2>
        <p className="lead">
          {name} · {dateLong}. Classes are better with your people there.
        </p>
        <div className="tellsheet-acts">
          {canAnnounce && (
            <button className="tellbtn" disabled={pending || announced} onClick={announce}>
              <Icon name={announced ? "check" : "notifications"} size={18} />
              {announced ? "Your people will see it in Updates" : "Let the people you follow know"}
            </button>
          )}
          <button className="tellbtn tellbtn-text" onClick={text}>
            <Icon name="campaign" size={18} /> Text someone the plan
          </button>
        </div>
        <button className="tertiary tellsheet-done" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}

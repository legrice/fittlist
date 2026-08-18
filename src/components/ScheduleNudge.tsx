"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";
import { MessageComposer } from "@/components/MessageComposer";

export function ScheduleNudge({ handle, name, signedIn }: { handle: string; name: string; signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const first = name.trim().split(/\s+/)[0] || name;

  useEffect(() => setMounted(true), []);

  return (
    <>
      <button type="button" className="btn si profile-empty-message" onClick={() => setOpen(true)}>
        <Icon name="chat_bubble" size={19} /> Ask what they&rsquo;re doing this week
      </button>
      {open && mounted && createPortal(
        <div className="sheet-scrim" onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <div className="sheet">
            <button className="iconbtn sheetclose" aria-label="Close" onClick={() => setOpen(false)}><Icon name="close" size={18} /></button>
            <h2 style={{ marginTop: 10 }}>Ask {first}</h2>
            <MessageComposer
              handle={handle}
              coachName={name}
              signedIn={signedIn}
              initialMessage={`Hey ${first}, what are you doing this week?`}
            />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

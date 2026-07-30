"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { ShareWeekSheet } from "@/components/ShareWeekSheet";
import { Toast, useToast } from "@/components/Toast";

// The floating button on a coach's own page. It used to say Add class; the
// prime spot goes to the weekly habit now, and adding moved up top. Only
// rendered when the week has something on it: "Share my week" over an empty
// week is an invitation to embarrassment.
export function ShareWeekFab({ handle }: { handle: string }) {
  const [open, setOpen] = useState(false);
  const [toastMsg, toastOn, toast] = useToast();
  return (
    <>
      <button className="fab" onClick={() => setOpen(true)}>
        {/* A megaphone, not sparkles: sparkles have come to mean "AI made
            this", and this button shares a real person's real week. */}
        <Icon name="campaign" size={20} />
        Share my week
      </button>
      <ShareWeekSheet handle={handle} open={open} onClose={() => setOpen(false)} onToast={toast} />
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}

"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { ShareWeekSheet } from "@/components/ShareWeekSheet";
import { Toast, useToast } from "@/components/Toast";

// Share my week, as the tinted pill at the top of the coach's own page
// (secondary, the brand wash); Add class holds the solid fab below. Only
// rendered when the week has something on it: "Share my week" over an empty
// week is an invitation to embarrassment.
export function ShareWeekPill({ handle }: { handle: string }) {
  const [open, setOpen] = useState(false);
  const [toastMsg, toastOn, toast] = useToast();
  return (
    <>
      <button className="sharepill" onClick={() => setOpen(true)}>
        <Icon name="campaign" size={18} />
        Share your schedule
      </button>
      <ShareWeekSheet handle={handle} open={open} onClose={() => setOpen(false)} onToast={toast} />
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}

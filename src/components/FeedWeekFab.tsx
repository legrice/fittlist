"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { ShareMyWeekSheet } from "@/components/ShareMyWeekSheet";

// The Following tab's floating button: once your week has something on it,
// the thing to do with it is show somebody. Hidden over an empty week, same
// rule as the coach's pill: "Share your week" over nothing is an invitation
// to embarrassment.
export function FeedWeekFab({ count }: { count: number }) {
  const [open, setOpen] = useState(false);
  if (count === 0) return null;
  return (
    <>
      <button className="fab feedfab" onClick={() => setOpen(true)}>
        <Icon name="campaign" size={20} />
        Share your week
      </button>
      {open && <ShareMyWeekSheet onClose={() => setOpen(false)} />}
    </>
  );
}

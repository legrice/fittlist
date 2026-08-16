"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setGroupShareMode } from "@/app/actions/groups";

export function GroupSharingControl({ groupId, initial }: { groupId: string; initial: string }) {
  const router = useRouter();
  const [mode, setMode] = useState(initial);
  const [pending, start] = useTransition();
  const choose = (next: "selected" | "public-week") => start(async () => {
    const result = await setGroupShareMode(groupId, next);
    if (result.ok) { setMode(next); router.refresh(); }
  });
  return <section className="group-sharing">
    <div><strong>What this group sees</strong><p>Joining shares nothing. Your public week is the same set of plans you put on your share image.</p></div>
    <div className="group-sharing-options" aria-label="Group calendar sharing">
      <button disabled={pending} className={mode === "public-week" ? "active" : ""} onClick={() => choose("public-week")}>Share my public week</button>
      <button disabled={pending} className={mode === "selected" ? "active" : ""} onClick={() => choose("selected")}>I’ll choose plans</button>
    </div>
    {mode === "selected" && <a href="/calendar">Choose plans from your calendar</a>}
  </section>;
}

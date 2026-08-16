"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setGroupMembership } from "@/app/actions/groups";

export function GroupJoinButton({ groupId, initial, signedIn, inviteToken }: { groupId: string; initial: boolean; signedIn: boolean; inviteToken?: string }) {
  const router = useRouter();
  const [joined, setJoined] = useState(initial);
  const [pending, start] = useTransition();
  return <button className={`btn ${joined ? "si" : "ghost"}`} disabled={pending} onClick={() => {
    if (!signedIn) return router.push("/?signup=1");
    start(async () => {
      const result = await setGroupMembership(groupId, !joined, inviteToken);
      if (result.ok) { setJoined(!joined); router.refresh(); }
    });
  }}>{pending ? "Saving…" : joined ? "Joined" : "Join group"}</button>;
}

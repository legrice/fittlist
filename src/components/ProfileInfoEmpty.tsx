"use client";

import Link from "next/link";
import { useTransition } from "react";
import { nudgeProfileInfo } from "@/app/actions/profile";
import { Toast, useToast } from "@/components/Toast";

export function ProfileInfoEmpty({ handle, firstName, owner }: {
  handle: string;
  firstName: string;
  owner: boolean;
}) {
  const [pending, start] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();
  const nudge = () => start(async () => {
    const result = await nudgeProfileInfo(handle);
    if (result.signedOut) {
      window.location.href = `/?next=/${handle}/about`;
      return;
    }
    if (!result.ok) return;
    toast(result.alreadySent ? `You already nudged ${firstName}` : `Nudge sent to ${firstName}`);
  });

  return (
    <>
      <div className="empty-block profile-info-empty">
        <h2>{firstName} hasn&rsquo;t added anything to their info yet</h2>
        {owner ? (
          <Link className="info-nudge" href="/settings?edit=1">Add info</Link>
        ) : (
          <button className="info-nudge" disabled={pending} onClick={nudge}>
            {pending ? "Sending…" : `Nudge ${firstName}`}
          </button>
        )}
      </div>
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}

"use client";

export function GroupShareButton({ name, inviteToken }: { name: string; inviteToken?: string }) {
  return <button className="btn ghost" onClick={async () => {
    const base = `${window.location.origin}${window.location.pathname}`;
    const url = inviteToken ? `${base}?invite=${encodeURIComponent(inviteToken)}` : base;
    if (navigator.share) {
      try { await navigator.share({ title: name, url }); } catch { /* cancelled */ }
      return;
    }
    await navigator.clipboard.writeText(url);
  }}>{inviteToken ? "Invite people" : "Share group"}</button>;
}

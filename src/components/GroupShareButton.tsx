"use client";

export function GroupShareButton({ name }: { name: string }) {
  return <button className="btn ghost" onClick={async () => {
    const url = window.location.href;
    if (navigator.share) {
      try { await navigator.share({ title: name, url }); } catch { /* cancelled */ }
      return;
    }
    await navigator.clipboard.writeText(url);
  }}>Share group</button>;
}

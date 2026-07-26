"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clearAnnouncement, setAnnouncement } from "@/app/actions/announcement";
import { Icon } from "@/components/Icon";

const MAX = 160;

// The coach's status bar on their own schedule: shows the active announcement
// (or a prompt to add one) and opens a sheet to write/broadcast/clear it. The
// same text renders as a pinned banner on their public page.
export function AnnouncementEditor({
  announcement,
  subsCount,
  onToast,
}: {
  announcement: string | null;
  subsCount: number;
  onToast: (m: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(announcement ?? "");
  const [broadcast, setBroadcast] = useState(false);
  const [pending, start] = useTransition();

  const openSheet = () => {
    setText(announcement ?? "");
    setBroadcast(false);
    setOpen(true);
  };

  const save = () =>
    start(async () => {
      const res = await setAnnouncement(text, broadcast && subsCount > 0);
      if (!res.ok) {
        onToast(res.error ?? "Couldn't save");
        return;
      }
      setOpen(false);
      onToast(
        broadcast && subsCount > 0
          ? `Announcement posted and emailed to ${subsCount} ${subsCount === 1 ? "subscriber" : "subscribers"}`
          : "Announcement posted",
      );
      router.refresh();
    });

  const clear = () =>
    start(async () => {
      const res = await clearAnnouncement();
      if (!res.ok) {
        onToast(res.error ?? "Couldn't remove");
        return;
      }
      setOpen(false);
      onToast("Announcement removed");
      router.refresh();
    });

  return (
    <>
      {announcement ? (
        <button className="annbar" onClick={openSheet}>
          <span className="annbar-ic"><Icon name="campaign" size={18} /></span>
          <span className="annbar-txt">{announcement}</span>
          <span className="annbar-edit"><Icon name="edit" size={16} /></span>
        </button>
      ) : (
        <button className="annadd" onClick={openSheet}>
          <Icon name="campaign" size={18} /> Add an announcement
        </button>
      )}

      {open && (
        <div className="sheet-scrim" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="sheet">
            <button className="iconbtn sheetclose" aria-label="Close" onClick={() => setOpen(false)}>
              <Icon name="close" size={16} />
            </button>
            <h2>Announcement</h2>
            <p className="lead">
              A short note pinned to the top of your public page — a cancellation, a sub, a schedule
              change, time off.
            </p>
            <textarea
              className="editinput annta"
              placeholder="e.g. No 6pm class this Thursday — back to normal next week."
              maxLength={MAX}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
            />
            <div className="anncount">{MAX - text.length} left</div>
            {subsCount > 0 && (
              <label className="annbroadcast">
                <input
                  type="checkbox"
                  checked={broadcast}
                  onChange={(e) => setBroadcast(e.target.checked)}
                />
                <span>
                  Email my {subsCount} {subsCount === 1 ? "subscriber" : "subscribers"}
                </span>
              </label>
            )}
            <div className="publishwrap">
              <button className="btn si" onClick={save} disabled={pending || text.trim().length < 2}>
                {pending ? "Saving…" : broadcast && subsCount > 0 ? "Post & email" : "Post announcement"}
              </button>
              {announcement && (
                <button className="annremove" onClick={clear} disabled={pending}>
                  Remove announcement
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

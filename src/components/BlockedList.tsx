"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { unblockPerson, type BlockedPerson } from "@/app/actions/blocks";
import { Toast, useToast } from "@/components/Toast";

// The one place a block is ever visible: your own list, so you can undo it.
// Nobody else sees this, and the people on it are never told they're on it.
export function BlockedList({ people }: { people: BlockedPerson[] }) {
  const router = useRouter();
  const [gone, setGone] = useState<Record<string, boolean>>({});
  const [, start] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();

  const undo = (p: BlockedPerson) => {
    setGone((g) => ({ ...g, [p.id]: true }));
    start(async () => {
      const res = await unblockPerson(p.id);
      if (!res.ok) {
        setGone((g) => ({ ...g, [p.id]: false }));
        toast("Couldn't do that");
        return;
      }
      toast(`${p.name.trim().split(/\s+/)[0]} can see your page again`);
      router.refresh();
    });
  };

  const shown = people.filter((p) => !gone[p.id]);

  if (shown.length === 0) {
    return (
      <div className="empty-block">
        <h2>Nobody is removed</h2>
        <p>
          Remove someone from your followers list and they land here. They stop following you and
          your page stops loading for them, without being told.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="dislist">
        {shown.map((p) => (
          <div key={p.id} className="disrow">
            <div className="disrow-main">
              {p.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="disrow-av" src={p.photo} alt="" />
              ) : (
                <span
                  className="disrow-av disrow-av-empty"
                  style={{ background: p.color }}
                  aria-hidden="true"
                >
                  {(p.name.trim().charAt(0) || "?").toUpperCase()}
                </span>
              )}
              <span className="disrow-txt">
                <span className="nm">{p.name}</span>
                <span className="sub">Can&rsquo;t see your page</span>
              </span>
            </div>
            {/* Undoing doesn't refollow them. That was their choice to make. */}
            <button type="button" className="disfollow" onClick={() => undo(p)}>
              Allow
            </button>
          </div>
        ))}
      </div>
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}

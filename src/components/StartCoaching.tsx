"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { claimProfile } from "@/app/actions/auth";
import { Icon } from "@/components/Icon";
import { slug } from "@/lib/format";

// A member deciding to post their own classes. Same claim the coach signup
// runs — pick a name and a URL — so there's one way to become a coach rather
// than two that can drift. Everything they've built as a member (who they
// follow, the classes they marked Going) comes with them.
export function StartCoaching({ name }: { name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pName, setPName] = useState(name);
  const [pHandle, setPHandle] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();

  const preview = slug(pHandle.trim() || pName) || "yourname";

  const claim = () =>
    start(async () => {
      setErr("");
      const res = await claimProfile(pName, pHandle);
      if (!res.ok) {
        setErr(res.error ?? "Something went wrong.");
        return;
      }
      // /app sends them into the setup wizard, since they've never run it.
      router.push("/app");
    });

  return (
    <>
      <button className="setrow" onClick={() => setOpen(true)}>
        <span className="setrow-ic">
          <Icon name="calendar_month" size={22} />
        </span>
        <span className="setrow-txt">
          <span className="t">Post your own classes</span>
          <span className="s">Get a page and a schedule people can follow</span>
        </span>
        <span className="setrow-chev">
          <Icon name="chevron_right" size={20} />
        </span>
      </button>

      {open && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget && !pending) setOpen(false);
          }}
        >
          <div className="sheet">
            <button
              className="iconbtn sheetclose"
              aria-label="Close"
              onClick={() => setOpen(false)}
            >
              <Icon name="close" size={16} />
            </button>
            <h2>Post your own classes</h2>
            <p className="lead">
              You keep everything you follow. This adds a page of your own, at a link you pick.
            </p>
            <label className="flabel" htmlFor="scName">
              Your name
            </label>
            <input
              id="scName"
              className="editinput"
              placeholder="Your name"
              value={pName}
              onChange={(e) => setPName(e.target.value)}
            />
            <label className="flabel" htmlFor="scHandle">
              Your link <span>· leave blank to use your name</span>
            </label>
            <input
              id="scHandle"
              className="editinput"
              autoCapitalize="none"
              autoCorrect="off"
              placeholder={slug(pName) || "yourname"}
              value={pHandle}
              onChange={(e) => setPHandle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && claim()}
            />
            <p className="durnote" style={{ marginTop: 8 }}>
              fittlist.co/{preview}
            </p>
            {err && <div className="errorcopy" style={{ textAlign: "left" }}>{err}</div>}
            <div className="publishwrap nostick">
              <button className="btn si" disabled={pending || !pName.trim()} onClick={claim}>
                {pending ? "One sec…" : "Claim it"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

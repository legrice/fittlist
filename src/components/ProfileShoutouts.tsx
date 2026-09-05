"use client";

import { useState, useTransition } from "react";
import { moderateShoutout, submitShoutout } from "@/app/actions/shoutouts";
import { SignupPrompt } from "@/components/SignupPrompt";
import { BodyPortal } from "@/components/BodyPortal";
import { Icon } from "@/components/Icon";
import { ReportContentButton } from "@/components/ReportContentButton";

export type ProfileShoutout = { id: string; body: string; featured: boolean; authorName: string; authorUserId: string };

export function ProfileShoutouts({ handle, studioSlug, name, signedIn, viewerId, owner, initial }: {
  handle?: string;
  studioSlug?: string;
  name: string;
  signedIn: boolean;
  viewerId?: string | null;
  owner: boolean;
  initial: ProfileShoutout[];
}) {
  const [rows, setRows] = useState(initial);
  const [composer, setComposer] = useState(false);
  const [signup, setSignup] = useState(false);
  const [body, setBody] = useState("");
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const publicRows = rows.filter((row) => row.featured);
  const shown = owner ? rows : publicRows;
  const first = name.trim().split(/\s+/)[0] || name;
  const openComposer = () => signedIn ? setComposer(true) : setSignup(true);
  const send = () => start(async () => {
    const result = await submitShoutout({ handle, studioSlug }, body);
    if ("signedOut" in result && result.signedOut) { setComposer(false); setSignup(true); return; }
    if (!result.ok) { setMessage("error" in result ? result.error : "That didn’t work."); return; }
    setComposer(false); setBody(""); setMessage("Sent privately. They can feature it on their profile.");
  });
  const moderate = (id: string, action: "feature" | "hide" | "delete") => start(async () => {
    const result = await moderateShoutout(id, action);
    if (!result.ok) return;
    setRows((old) => action === "delete" ? old.filter((r) => r.id !== id) : old.map((r) => r.id === id ? { ...r, featured: action === "feature" } : r));
  });

  return (
    <section id="profile-shoutouts" className="profile-anchor-section profile-shoutouts">
      <div className="shoutouts-head">
        <div><h2 className="profile-section-title">Shoutouts</h2><p>Kind words from the community.</p></div>
      </div>
      {shown.length ? (
        <>
          <div className="shoutout-list">
            {shown.map((row) => (
              <article className="shoutout-card" key={row.id}>
                <p>“{row.body}”</p><span>From {row.authorName}</span>
                {viewerId && viewerId !== row.authorUserId && <ReportContentButton contentType="shoutout" contentId={row.id} label="Report shoutout" canBlock />}
                {owner && <div className="shoutout-actions">
                  <button disabled={pending} onClick={() => moderate(row.id, row.featured ? "hide" : "feature")}>{row.featured ? "Remove from profile" : "Feature on profile"}</button>
                  <button disabled={pending} onClick={() => moderate(row.id, "delete")}>Delete</button>
                </div>}
              </article>
            ))}
          </div>
          {!owner && <button className="btn shoutout-give shoutout-give-after" onClick={openComposer}>Give a shoutout</button>}
        </>
      ) : <div className="empty-block compact shoutout-empty"><h3>No shoutouts yet</h3><p>{owner ? "New shoutouts will arrive here for you to feature." : `Be the first to give ${first} a shoutout.`}</p>{!owner && <button className="btn shoutout-give" onClick={openComposer}>Give a shoutout</button>}</div>}
      {message && <p className="shoutout-message" role="status">{message}</p>}
      <BodyPortal>{composer && <div className="sheet-scrim" onClick={(e) => { if (e.target === e.currentTarget) setComposer(false); }}><div className="sheet shoutout-sheet" role="dialog" aria-modal="true" aria-labelledby="shoutout-title"><button className="iconbtn sheetclose sheet-dismiss" aria-label="Close" onClick={() => setComposer(false)}><Icon name="close" size={20} /></button><h2 id="shoutout-title">Give {first} a shoutout</h2><p className="lead">What should people know about them?</p><textarea value={body} maxLength={280} autoFocus placeholder={`What makes ${first} great?`} onChange={(e) => setBody(e.target.value)} /><div className="shoutout-counter">{body.length}/280</div><button className="btn si" disabled={pending || body.trim().length < 8} onClick={send}>{pending ? "Sending…" : "Send privately"}</button></div></div>}</BodyPortal>
      <SignupPrompt open={signup} onClose={() => setSignup(false)} next={studioSlug ? `/s/${studioSlug}#profile-shoutouts` : `/${handle}#profile-shoutouts`} via={handle} title="Join the conversation" body="Sign up to give shoutouts and celebrate the people and places that make fitness better." />
    </section>
  );
}

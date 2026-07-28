"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { claimProfile } from "@/app/actions/auth";
import { updateProfile } from "@/app/actions/profile";
import { Icon } from "@/components/Icon";
import { LocationInput } from "@/components/LocationInput";
import { slug } from "@/lib/format";
import { Toast, useToast } from "@/components/Toast";

// Editing a member's profile: the same fields the setup wizard collects, in one
// sheet. Members who joined before profiles existed have no handle yet, so this
// doubles as the place to claim one.
export function MemberProfileEditor({
  name,
  handle,
  title,
  about,
  location,
  photo,
  color,
  openOnMount = false,
}: {
  name: string;
  handle: string | null;
  title: string;
  about: string;
  location: string;
  photo: string | null;
  color: string;
  /** Arrived from "Edit your profile" on the public page. */
  openOnMount?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(openOnMount);
  const [mounted, setMounted] = useState(false);
  const [pName, setPName] = useState(name);
  const [pHandle, setPHandle] = useState(handle ?? "");
  const [pTitle, setPTitle] = useState(title);
  const [pAbout, setPAbout] = useState(about);
  const [pLocation, setPLocation] = useState(location);
  const [pPhoto, setPPhoto] = useState<string | null>(photo);
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (openOnMount) window.history.replaceState(null, "", "/you");
  }, [openOnMount]);

  // Same client-side resize the coach editor uses: a data URL small enough to
  // live in a row without a blob store behind it.
  const pickPhoto = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        const size = 480;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        setPPhoto(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const preview = slug(pHandle.trim() || pName) || "yourname";

  const save = () =>
    start(async () => {
      setErr("");
      if (!pName.trim()) {
        setErr("Enter your name.");
        return;
      }
      // No handle yet, or they changed it: claim it first, since that's the one
      // field that can be refused.
      if (!handle || slug(pHandle.trim() || pName) !== handle) {
        const claimed = await claimProfile(pName, pHandle, null, "fan");
        if (!claimed.ok) {
          setErr(claimed.error ?? "Couldn't save that link.");
          return;
        }
      }
      const res = await updateProfile({
        name: pName,
        title: pTitle,
        about: pAbout,
        location: pLocation,
        photo: pPhoto,
        // Contact fields are a coach's, and this sheet doesn't offer them.
        // Empty is the honest value rather than a field left half-set.
        instagram: "",
        website: "",
      });
      if (!res.ok) {
        setErr(res.error ?? "Couldn't save.");
        return;
      }
      setOpen(false);
      toast("Profile saved");
      router.refresh();
    });

  return (
    <>
      <button className="setrow" onClick={() => setOpen(true)}>
        <span className="setrow-ic">
          <Icon name="account_circle" size={22} />
        </span>
        <span className="setrow-txt">
          <span className="t">{handle ? "Edit your profile" : "Set up your profile"}</span>
          <span className="s">
            {handle ? `fittlist.co/${handle}` : "Pick a link, add a photo and a line about you"}
          </span>
        </span>
        <span className="setrow-chev">
          <Icon name="chevron_right" size={20} />
        </span>
      </button>

      {/* Portalled: the account view traps stacking under the tab bar. */}
      {open && mounted && createPortal(
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget && !pending) setOpen(false);
          }}
        >
          <div className="sheet">
            <button className="iconbtn sheetclose" aria-label="Close" onClick={() => setOpen(false)}>
              <Icon name="close" size={16} />
            </button>
            <h2>Your profile</h2>
            <p className="lead">
              This is what a coach sees when you follow them, and what anyone opening your link
              sees.
            </p>

            <div className="mepho">
              {pPhoto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="mepho-img" src={pPhoto} alt="" />
              ) : (
                <span className="mepho-img mepho-empty" style={{ background: color }}>
                  {(pName.trim().charAt(0) || "?").toUpperCase()}
                </span>
              )}
              <div className="mepho-actions">
                <button className="btn ghost" onClick={() => fileRef.current?.click()}>
                  {pPhoto ? "Change photo" : "Add a photo"}
                </button>
                {pPhoto && (
                  <button className="linktoggle" onClick={() => setPPhoto(null)}>
                    Remove
                  </button>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) pickPhoto(f);
                  e.target.value = "";
                }}
              />
            </div>

            <label className="flabel" htmlFor="meName">
              Your name
            </label>
            <input
              id="meName"
              className="editinput"
              maxLength={80}
              value={pName}
              onChange={(e) => setPName(e.target.value)}
            />

            <label className="flabel" htmlFor="meHandle">
              Your link <span>· fittlist.co/{preview}</span>
            </label>
            <input
              id="meHandle"
              className="editinput"
              autoCapitalize="none"
              autoCorrect="off"
              maxLength={30}
              placeholder={slug(pName) || "yourname"}
              value={pHandle}
              onChange={(e) => setPHandle(e.target.value)}
            />

            <label className="flabel" htmlFor="meTitle">
              Tagline <span>· optional</span>
            </label>
            <input
              id="meTitle"
              className="editinput"
              maxLength={80}
              placeholder="Lifts heavy, runs slow"
              value={pTitle}
              onChange={(e) => setPTitle(e.target.value)}
            />

            <label className="flabel" htmlFor="meLoc">
              Where you train <span>· city and state, required</span>
            </label>
            <LocationInput id="meLoc" value={pLocation} onChange={setPLocation} />

            <label className="flabel" htmlFor="meAbout">
              About <span>· optional</span>
            </label>
            <textarea
              id="meAbout"
              className="abouttext"
              rows={3}
              maxLength={600}
              placeholder="Six mornings a week, mostly barbells."
              value={pAbout}
              onChange={(e) => setPAbout(e.target.value)}
            />

            {err && (
              <div className="errorcopy" style={{ textAlign: "left" }}>
                {err}
              </div>
            )}
            <div className="publishwrap nostick">
              <button className="btn si" disabled={pending || !pName.trim()} onClick={save}>
                {pending ? "Saving…" : "Save profile"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}

"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProfile } from "@/app/actions/profile";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";

// Shown at the top of the public profile page when the owner is viewing it:
// a back arrow (to the account page) and an Edit button that opens the editor.
export function ProfileOwnerBar({
  name,
  title,
  about,
  instagram,
  website,
  photo,
}: {
  name: string;
  title: string;
  about: string;
  instagram: string;
  website: string;
  photo: string | null;
}) {
  const router = useRouter();
  const [toastMsg, toastOn, toast] = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [pName, setPName] = useState(name);
  const [pTitle, setPTitle] = useState(title);
  const [pAbout, setPAbout] = useState(about);
  const [pInstagram, setPInstagram] = useState(instagram);
  const [pWebsite, setPWebsite] = useState(website);
  const [pPhoto, setPPhoto] = useState<string | null>(photo);
  const [saving, startSaving] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  // Resize the picked image to a small JPEG data URL before storing it.
  const pickPhoto = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 640;
        let { width, height } = img;
        if (width > height && width > max) {
          height = (height * max) / width;
          width = max;
        } else if (height > max) {
          width = (width * max) / height;
          height = max;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d")?.drawImage(img, 0, 0, width, height);
        setPPhoto(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const openEdit = () => {
    setPName(name);
    setPTitle(title);
    setPAbout(about);
    setPInstagram(instagram);
    setPWebsite(website);
    setPPhoto(photo);
    setEditOpen(true);
  };

  const saveProfile = () =>
    startSaving(async () => {
      const res = await updateProfile({
        name: pName,
        title: pTitle,
        about: pAbout,
        instagram: pInstagram,
        website: pWebsite,
        photo: pPhoto,
      });
      if (!res.ok) {
        toast(res.error ?? "Couldn't save");
        return;
      }
      setEditOpen(false);
      toast("Profile saved");
      router.refresh();
    });

  return (
    <>
      <div className="ownerbar">
        <button className="ownerback" aria-label="Back to your account" onClick={() => router.push("/app?acct=1")}>
          <Icon name="arrow_back" size={20} />
        </button>
        <button className="owneredit" onClick={openEdit}>
          Edit
        </button>
      </div>

      {editOpen && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditOpen(false);
          }}
        >
          <div className="sheet">
            <button className="iconbtn sheetclose" aria-label="Close" onClick={() => setEditOpen(false)}>
              <Icon name="close" size={16} />
            </button>
            <h2>Edit profile</h2>
            <div className="editphoto">
              {pPhoto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="editphoto-img" src={pPhoto} alt="" />
              ) : (
                <div className="editphoto-img profrow-empty" aria-hidden="true">
                  {(pName.trim().charAt(0) || "?").toUpperCase()}
                </div>
              )}
              <div className="editphoto-actions">
                <button className="btn ghost" onClick={() => fileRef.current?.click()}>
                  {pPhoto ? "Change photo" : "Add photo"}
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
            <label className="flabel" htmlFor="pName">
              Name
            </label>
            <input
              id="pName"
              type="text"
              className="editinput"
              value={pName}
              maxLength={80}
              onChange={(e) => setPName(e.target.value)}
            />
            <label className="flabel" htmlFor="pTitle">
              Title <span>· your role or tagline</span>
            </label>
            <input
              id="pTitle"
              type="text"
              className="editinput"
              value={pTitle}
              maxLength={80}
              placeholder="Strength coach"
              onChange={(e) => setPTitle(e.target.value)}
            />
            <label className="flabel" htmlFor="pAbout">
              About <span>· a line or two about you</span>
            </label>
            <textarea
              id="pAbout"
              className="abouttext"
              value={pAbout}
              maxLength={600}
              rows={4}
              placeholder="Coach at three studios across Jersey City. Strength &amp; conditioning, all levels."
              onChange={(e) => setPAbout(e.target.value)}
            />
            <label className="flabel" htmlFor="pInstagram">
              Instagram <span>· optional</span>
            </label>
            <div className="editprefix">
              <span className="editprefix-at">@</span>
              <input
                id="pInstagram"
                type="text"
                className="editinput"
                value={pInstagram}
                maxLength={40}
                placeholder="yourhandle"
                autoCapitalize="none"
                autoCorrect="off"
                onChange={(e) => setPInstagram(e.target.value)}
              />
            </div>
            <label className="flabel" htmlFor="pWebsite">
              Website <span>· optional</span>
            </label>
            <input
              id="pWebsite"
              type="url"
              className="editinput"
              value={pWebsite}
              maxLength={200}
              placeholder="yoursite.com"
              autoCapitalize="none"
              autoCorrect="off"
              onChange={(e) => setPWebsite(e.target.value)}
            />
            <div className="publishwrap">
              <button className="btn si" disabled={saving || !pName.trim()} onClick={saveProfile}>
                {saving ? "Saving…" : "Save profile"}
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}

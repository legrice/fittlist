"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProfile } from "@/app/actions/profile";
import { useSlideBack } from "@/components/BackLink";
import { ChipsField } from "@/components/ChipsField";
import { LinksField, type ProfileLink } from "@/components/LinksField";
import { AVATAR_COLORS, avatarColor } from "@/lib/avatar";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";

// Shown at the top of the public profile page when the owner is viewing it:
// a back arrow (to the account page) and an Edit button that opens the editor.
export function ProfileOwnerBar({
  name,
  title,
  about,
  location,
  certifications,
  highlights,
  availability,
  instagram,
  website,
  contactEmail,
  phone,
  whatsapp,
  profileLinks,
  photo,
  avatarColor: avatarColorProp,
  userId,
}: {
  name: string;
  title: string;
  about: string;
  location: string;
  certifications: string[];
  highlights: string[];
  availability: string | null;
  instagram: string;
  website: string;
  contactEmail: string;
  phone: string;
  whatsapp: string;
  profileLinks: ProfileLink[];
  photo: string | null;
  avatarColor?: string | null;
  userId: string;
}) {
  const router = useRouter();
  const slideBack = useSlideBack();
  const [toastMsg, toastOn, toast] = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [pName, setPName] = useState(name);
  const [pTitle, setPTitle] = useState(title);
  const [pAbout, setPAbout] = useState(about);
  const [pLocation, setPLocation] = useState(location);
  const [pCerts, setPCerts] = useState<string[]>(certifications);
  const [pHighlights, setPHighlights] = useState<string[]>(highlights);
  const [pAvailability, setPAvailability] = useState<string | null>(availability);
  const [pInstagram, setPInstagram] = useState(instagram);
  const [pWebsite, setPWebsite] = useState(website);
  const [pEmail, setPEmail] = useState(contactEmail);
  const [pPhone, setPPhone] = useState(phone);
  const [pWhatsapp, setPWhatsapp] = useState(whatsapp);
  const [pLinks, setPLinks] = useState<ProfileLink[]>(profileLinks);
  const [pPhoto, setPPhoto] = useState<string | null>(photo);
  const [pColor, setPColor] = useState<string | null>(avatarColorProp ?? null);
  const [colorOpen, setColorOpen] = useState(false);
  const shownColor = avatarColor({ id: userId, avatarColor: pColor });
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
    setPLocation(location);
    setPCerts(certifications);
    setPHighlights(highlights);
    setPAvailability(availability);
    setPInstagram(instagram);
    setPWebsite(website);
    setPEmail(contactEmail);
    setPPhone(phone);
    setPWhatsapp(whatsapp);
    setPLinks(profileLinks);
    setPPhoto(photo);
    setPColor(avatarColorProp ?? null);
    setEditOpen(true);
  };

  const saveProfile = () =>
    startSaving(async () => {
      const res = await updateProfile({
        name: pName,
        title: pTitle,
        about: pAbout,
        location: pLocation,
        certifications: pCerts,
        highlights: pHighlights,
        availability: pAvailability,
        instagram: pInstagram,
        website: pWebsite,
        contactEmail: pEmail,
        phone: pPhone,
        whatsapp: pWhatsapp,
        profileLinks: pLinks,
        photo: pPhoto,
        avatarColor: pColor,
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
        <button className="ownerback" aria-label="Back to your account" onClick={() => slideBack("/app?acct=1")}>
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
                <div
                  className="editphoto-img profrow-empty"
                  style={{ background: shownColor }}
                  aria-hidden="true"
                >
                  {(pName.trim().charAt(0) || "?").toUpperCase()}
                </div>
              )}
              <div className="editphoto-actions">
                <button className="btn ghost" onClick={() => fileRef.current?.click()}>
                  {pPhoto ? "Change photo" : "Add photo"}
                </button>
                {pPhoto ? (
                  <button className="linktoggle" onClick={() => setPPhoto(null)}>
                    Remove
                  </button>
                ) : (
                  // No photo? Then the colour behind the initial is what people
                  // see — offered here as the alternative, not dumped on the form.
                  <button
                    className="linktoggle"
                    aria-expanded={colorOpen}
                    onClick={() => setColorOpen((v) => !v)}
                  >
                    {colorOpen ? "Done" : "Or pick a colour"}
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
            {!pPhoto && colorOpen && (
              <div className="swatchgrid">
                {AVATAR_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`swatch${c === shownColor ? " on" : ""}`}
                    style={{ background: c }}
                    aria-label={`Colour ${c}`}
                    aria-pressed={c === shownColor}
                    onClick={() => setPColor(c)}
                  />
                ))}
              </div>
            )}
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
            <label className="flabel" htmlFor="pLocation">
              Location <span>· city or area</span>
            </label>
            <input
              id="pLocation"
              type="text"
              className="editinput"
              value={pLocation}
              maxLength={80}
              placeholder="Jersey City, NJ"
              onChange={(e) => setPLocation(e.target.value)}
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
            <label className="flabel">
              Availability <span>· taking new private clients?</span>
            </label>
            <div className="seg availseg">
              <button
                type="button"
                className={pAvailability === "accepting" ? "sel" : ""}
                onClick={() => setPAvailability(pAvailability === "accepting" ? null : "accepting")}
              >
                Accepting
              </button>
              <button
                type="button"
                className={pAvailability === "waitlist" ? "sel" : ""}
                onClick={() => setPAvailability(pAvailability === "waitlist" ? null : "waitlist")}
              >
                Waitlist
              </button>
              <button
                type="button"
                className={!pAvailability ? "sel" : ""}
                onClick={() => setPAvailability(null)}
              >
                Hidden
              </button>
            </div>
            <label className="flabel">
              Certifications <span>· optional</span>
            </label>
            <ChipsField value={pCerts} onChange={setPCerts} placeholder="e.g. NASM CPT" maxLen={40} max={12} />
            <label className="flabel">
              Coaching focus <span>· a few short descriptors</span>
            </label>
            <ChipsField value={pHighlights} onChange={setPHighlights} placeholder="e.g. Beginner friendly" maxLen={60} max={6} />
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
            <label className="flabel">
              More links <span>· booking, programs, anything (up to 6)</span>
            </label>
            <LinksField value={pLinks} onChange={setPLinks} />
            <label className="flabel" htmlFor="pEmail">
              Contact email <span>· optional, shown as an email button</span>
            </label>
            <input
              id="pEmail"
              type="email"
              className="editinput"
              value={pEmail}
              maxLength={120}
              placeholder="you@example.com"
              autoCapitalize="none"
              autoCorrect="off"
              onChange={(e) => setPEmail(e.target.value)}
            />
            <label className="flabel" htmlFor="pPhone">
              Phone <span>· optional, call or text</span>
            </label>
            <input
              id="pPhone"
              type="tel"
              className="editinput"
              value={pPhone}
              maxLength={40}
              placeholder="+1 555 123 4567"
              onChange={(e) => setPPhone(e.target.value)}
            />
            <label className="flabel" htmlFor="pWhatsapp">
              WhatsApp <span>· optional</span>
            </label>
            <input
              id="pWhatsapp"
              type="tel"
              className="editinput"
              value={pWhatsapp}
              maxLength={40}
              placeholder="+1 555 123 4567"
              onChange={(e) => setPWhatsapp(e.target.value)}
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

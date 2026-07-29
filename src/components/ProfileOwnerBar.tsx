"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProfile } from "@/app/actions/profile";
import { myWeekText } from "@/app/actions/weektext";
import { ChipsField } from "@/components/ChipsField";
import { LinksField, type ProfileLink } from "@/components/LinksField";
import { AVATAR_COLORS, avatarColor } from "@/lib/avatar";
import { Icon } from "@/components/Icon";
import { LocationInput } from "@/components/LocationInput";
import { QrSheet } from "@/components/QrSheet";
import { ShareWeekSheet } from "@/components/ShareWeekSheet";
import { Toast, useToast } from "@/components/Toast";

// Everything a coach does with their own page, behind one button.
//
// It used to be a strip of pills above the schedule (Your profile, Share week,
// QR code, Copy week) plus an Edit button in a bar of its own. That was two
// rows of chrome on the screen people spend the most time on, for things you
// reach for once a week. They live in a sheet under a three-dot button beside
// the name now, which is where the rest of the internet keeps them.
export function ProfileOwnerBar({
  name,
  title,
  about,
  location,
  certifications,
  highlights,
  instagram,
  website,
  contactEmail,
  phone,
  whatsapp,
  profileLinks,
  photo,
  avatarColor: avatarColorProp,
  userId,
  handle,
}: {
  name: string;
  title: string;
  about: string;
  location: string;
  certifications: string[];
  highlights: string[];
  instagram: string;
  website: string;
  contactEmail: string;
  phone: string;
  whatsapp: string;
  profileLinks: ProfileLink[];
  photo: string | null;
  avatarColor?: string | null;
  userId: string;
  handle: string;
}) {
  const router = useRouter();
  const [toastMsg, toastOn, toast] = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [pName, setPName] = useState(name);
  const [pTitle, setPTitle] = useState(title);
  const [pAbout, setPAbout] = useState(about);
  const [pLocation, setPLocation] = useState(location);
  const [pCerts, setPCerts] = useState<string[]>(certifications);
  const [pHighlights, setPHighlights] = useState<string[]>(highlights);
  const [pInstagram, setPInstagram] = useState(instagram);
  const [pWebsite, setPWebsite] = useState(website);
  const [pEmail, setPEmail] = useState(contactEmail);
  const [pPhone, setPPhone] = useState(phone);
  const [pWhatsapp, setPWhatsapp] = useState(whatsapp);
  const [pLinks, setPLinks] = useState<ProfileLink[]>(profileLinks);
  const [pPhoto, setPPhoto] = useState<string | null>(photo);
  const [pColor, setPColor] = useState<string | null>(avatarColorProp ?? null);
  const [colorOpen, setColorOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
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

  // ?edit=1 arrives from the account tile's Edit profile — open straight into
  // the editor rather than making them find the button again.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("edit")) {
      openEdit();
      window.history.replaceState(null, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openEdit = () => {
    setPName(name);
    setPTitle(title);
    setPAbout(about);
    setPLocation(location);
    setPCerts(certifications);
    setPHighlights(highlights);
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

  const copyWeek = async () => {
    setMenuOpen(false);
    const res = await myWeekText();
    if (!res.ok || !res.text) {
      toast(res.error ?? "Couldn't copy that");
      return;
    }
    try {
      await navigator.clipboard.writeText(res.text);
      toast("Week copied, ready to paste");
    } catch {
      toast("Couldn't copy that");
    }
  };

  const go = (href: string) => {
    setMenuOpen(false);
    router.push(href);
  };

  return (
    <>
      <button
        className="ownermore"
        aria-label="More"
        aria-haspopup="dialog"
        onClick={() => setMenuOpen(true)}
      >
        <Icon name="more_horiz" size={20} />
      </button>

      {menuOpen && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setMenuOpen(false);
          }}
        >
          <div className="sheet">
            <button className="iconbtn sheetclose" aria-label="Close" onClick={() => setMenuOpen(false)}>
              <Icon name="close" size={16} />
            </button>
            <h2>Your page</h2>
            <div className="settingslist ownermenu">
              {/* The thing you came here to do most often goes first. */}
              <button className="setrow" onClick={() => go("/app?add=1")}>
                <span className="setrow-ic"><Icon name="add" size={22} /></span>
                <span className="setrow-txt">
                  <span className="t">Add a class</span>
                  <span className="s">Put another one on your week</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={20} /></span>
              </button>
              <button className="setrow" onClick={() => { setMenuOpen(false); openEdit(); }}>
                <span className="setrow-ic"><Icon name="account_circle" size={22} /></span>
                <span className="setrow-txt">
                  <span className="t">Edit profile</span>
                  <span className="s">Your photo, bio and contact details</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={20} /></span>
              </button>
              <button className="setrow" onClick={() => { setMenuOpen(false); setShareOpen(true); }}>
                <span className="setrow-ic"><Icon name="share" size={22} /></span>
                <span className="setrow-txt">
                  <span className="t">Share your week</span>
                  <span className="s">A story image with your link</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={20} /></span>
              </button>
              <button className="setrow" onClick={() => { setMenuOpen(false); setQrOpen(true); }}>
                <span className="setrow-ic"><Icon name="qr_code_2" size={22} /></span>
                <span className="setrow-txt">
                  <span className="t">Your QR code</span>
                  <span className="s">A scannable code that opens your page</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={20} /></span>
              </button>
              {/* The story image is for a story. This is for the group chat,
                  where an image is no use and a coach ends up typing it out. */}
              <button className="setrow" onClick={copyWeek}>
                <span className="setrow-ic"><Icon name="content_copy" size={22} /></span>
                <span className="setrow-txt">
                  <span className="t">Copy your week</span>
                  <span className="s">As text, ready to paste</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={20} /></span>
              </button>
              <button className="setrow" onClick={() => go("/requests")}>
                <span className="setrow-ic"><Icon name="mail" size={22} /></span>
                <span className="setrow-txt">
                  <span className="t">Requests</span>
                  <span className="s">People asking about private sessions</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={20} /></span>
              </button>
            </div>
          </div>
        </div>
      )}

      <ShareWeekSheet
        handle={handle}
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        onToast={toast}
      />
      <QrSheet handle={handle} open={qrOpen} onClose={() => setQrOpen(false)} onToast={toast} />

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
              Location <span>· city and state, required</span>
            </label>
            <LocationInput id="pLocation" value={pLocation} onChange={setPLocation} />
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
            {/* Availability moved to its own settings row. It is a switch you
                flip when your books change, not something you edit alongside
                your bio, and it was the only control in here that changed what
                a visitor could do rather than what they read. */}
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

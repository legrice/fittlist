"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProfile } from "@/app/actions/profile";
import { myWeekText } from "@/app/actions/weektext";
import { ChipsField } from "@/components/ChipsField";
import { TypeMultiSelect } from "@/components/TypePicker";
import { LinksField, type ProfileLink } from "@/components/LinksField";
import { MyStudios } from "@/components/MyStudios";
import { AVATAR_COLORS, avatarColor } from "@/lib/avatar";
import { BodyPortal } from "@/components/BodyPortal";
import { Icon } from "@/components/Icon";
import { readPhotoPair } from "@/lib/photo";
import { LocationInput } from "@/components/LocationInput";
import { QrSheet } from "@/components/QrSheet";
import { ShareCardSheet } from "@/components/ShareCardSheet";
import { Toast, useToast } from "@/components/Toast";

// What a coach does with their own page, in the same two slots a visitor gets.
//
// A visitor sees Message and Follow under the name. The owner sees Share and
// Edit profile in exactly that spot, same shapes and same weights: filled for
// the thing you came to do, outline for the other one. Sharing is the weekly
// habit, so it takes the filled one and opens every way of doing it.
//
// This replaced a three-dot menu beside the name, which was a lid over two
// buttons and a place things went to be forgotten. Its other two rows already
// had homes: adding a class is the floating button below, and Requests is a
// stat on the account.
export function ProfileOwnerBar({
  name,
  title,
  about,
  location,
  certifications,
  highlights,
  disciplines,
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
  disciplines: string[];
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
  const [pDisciplines, setPDisciplines] = useState<string[]>(disciplines);
  const [pInstagram, setPInstagram] = useState(instagram);
  const [pWebsite, setPWebsite] = useState(website);
  const [pEmail, setPEmail] = useState(contactEmail);
  const [pPhone, setPPhone] = useState(phone);
  const [pWhatsapp, setPWhatsapp] = useState(whatsapp);
  const [pLinks, setPLinks] = useState<ProfileLink[]>(profileLinks);
  // A link typed but not yet "+ Add"ed when Save is tapped. See LinksField.
  const pendingLink = useRef<ProfileLink | null>(null);
  const [pPhoto, setPPhoto] = useState<string | null>(photo);
  const [pThumb, setPThumb] = useState<string | null>(null);
  const [pColor, setPColor] = useState<string | null>(avatarColorProp ?? null);
  const [colorOpen, setColorOpen] = useState(false);
  const [shareMenu, setShareMenu] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const shownColor = avatarColor({ id: userId, avatarColor: pColor });
  const [saving, startSaving] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const pickPhoto = (file: File) =>
    readPhotoPair(file, (full, thumb) => {
      setPPhoto(full);
      setPThumb(thumb);
    });

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
    setPThumb(null);
    setPColor(avatarColorProp ?? null);
    setEditOpen(true);
  };

  const saveProfile = () =>
    startSaving(async () => {
      const links = pendingLink.current ? [...pLinks, pendingLink.current] : pLinks;
      const res = await updateProfile({
        name: pName,
        title: pTitle,
        about: pAbout,
        location: pLocation,
        certifications: pCerts,
        highlights: pHighlights,
        disciplines: pDisciplines,
        instagram: pInstagram,
        website: pWebsite,
        contactEmail: pEmail,
        phone: pPhone,
        whatsapp: pWhatsapp,
        profileLinks: links,
        photo: pPhoto,
        photoThumb: pThumb ?? undefined,
        avatarColor: pColor,
      });
      if (!res.ok) {
        toast(res.error ?? "Couldn't save");
        return;
      }
      pendingLink.current = null;
      setEditOpen(false);
      toast("Profile saved");
      router.refresh();
    });

  const copyWeek = async () => {
    setShareMenu(false);
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

  const copyLink = async () => {
    setShareMenu(false);
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/${handle}`);
      toast("Link copied, ready to paste");
    } catch {
      toast("Couldn't copy that");
    }
  };

  return (
    <>
      {/* The visitor's two pills, in the visitor's spot, saying what an owner
          does instead. Share leads because it's the weekly habit; editing your
          bio is a thing you do twice a year. */}
      <div className="profacts">
        <button className="actpill actpill-primary" onClick={() => setShareMenu(true)}>
          <Icon name="reply" className="share-arrow-forward" size={18} />
          <span>Share profile</span>
        </button>
        <button className="actpill" onClick={openEdit}>
          <Icon name="edit" size={18} />
          <span>Edit profile</span>
        </button>
      </div>

      {/* Everything from here down is an overlay or a toast: fixed layers
          that must escape the pinned head they render inside (sticky makes
          a stacking context on mobile, and trapped there they paint under
          the card and the tab bar). One portal moves the lot. */}
      <BodyPortal>
      {shareMenu && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShareMenu(false);
          }}
        >
          <div className="sheet">
            <button
              className="iconbtn sheetclose"
              aria-label="Close"
              onClick={() => setShareMenu(false)}
            >
              <Icon name="close" size={18} />
            </button>
            <h2>Share your page</h2>
            <div className="settingslist ownermenu">
              <button
                className="setrow"
                onClick={(event) => {
                  setShareMenu(false);
                  window.dispatchEvent(new CustomEvent("fittlist:open-share", {
                    detail: { opener:event.currentTarget },
                  }));
                }}
              >
                <span className="setrow-ic"><Icon name="campaign" size={24} /></span>
                <span className="setrow-txt">
                  <span className="t">Share your schedule</span>
                  <span className="s">A story image with your link</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
              </button>
              <button className="setrow" onClick={copyLink}>
                <span className="setrow-ic"><Icon name="link" size={24} /></span>
                <span className="setrow-txt">
                  <span className="t">Copy your link</span>
                  <span className="s">Straight to your page</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
              </button>
              <button
                className="setrow"
                onClick={() => {
                  setShareMenu(false);
                  setQrOpen(true);
                }}
              >
                <span className="setrow-ic"><Icon name="qr_code_2" size={24} /></span>
                <span className="setrow-txt">
                  <span className="t">Your QR code</span>
                  <span className="s">A scannable code that opens your page</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
              </button>
              {/* The square one: your face and your name rather than your
                  week. It lost its door when the avatar circle came off the
                  hero, and a made image with no way to reach it is the same as
                  no image. */}
              <button
                className="setrow"
                onClick={() => {
                  setShareMenu(false);
                  setCardOpen(true);
                }}
              >
                <span className="setrow-ic"><Icon name="auto_awesome" size={24} /></span>
                <span className="setrow-txt">
                  <span className="t">Your profile card</span>
                  <span className="s">A square image for a post</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
              </button>
              {/* The story image is for a story. This is for the group chat,
                  where an image is no use and a coach ends up typing it out. */}
              <button className="setrow" onClick={copyWeek}>
                <span className="setrow-ic"><Icon name="content_copy" size={24} /></span>
                <span className="setrow-txt">
                  <span className="t">Copy your week</span>
                  <span className="s">As text, ready to paste</span>
                </span>
                <span className="setrow-chev"><Icon name="chevron_right" size={22} /></span>
              </button>
            </div>
          </div>
        </div>
      )}

      <QrSheet handle={handle} open={qrOpen} onClose={() => setQrOpen(false)} onToast={toast} />
      {cardOpen && (
        <ShareCardSheet
          path={`/api/card/${handle}`}
          fileName={`fittlist-${handle}-card.png`}
          title="Share your card"
          lead="A square image of your profile, made for a post or a story. Your page is one tap from the link on it."
          alt="Your profile card"
          onClose={() => setCardOpen(false)}
          onToast={toast}
        />
      )}

      {editOpen && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditOpen(false);
          }}
        >
          <div className="sheet">
            <button className="iconbtn sheetclose" aria-label="Close" onClick={() => setEditOpen(false)}>
              <Icon name="close" size={18} />
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
                    {colorOpen ? "Done" : "Or pick a color"}
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
            {/* Each section is its label, its field, then its tags below the
                field. The Certifications label sat stranded above this block
                for a while, two headings deep from its own input. */}
            <label className="flabel">
              What you teach <span>· up to four, and it&rsquo;s how people find you</span>
            </label>
            <TypeMultiSelect
              value={pDisciplines}
              onChange={setPDisciplines}
              max={4}
              placeholder="Pick up to four"
              title="What you teach"
            />
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
            <LinksField value={pLinks} onChange={setPLinks} onPending={(l) => (pendingLink.current = l)} />
            <label className="flabel">
              Where I coach <span>· the studios on your page</span>
            </label>
            <MyStudios />
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
      </BodyPortal>
    </>
  );
}

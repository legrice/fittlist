"use client";

import { useEffect, useState, useTransition } from "react";
import { STORY_THEMES, type StoryThemeId } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { findShareRecipients, sendClassShare, type ShareRecipient } from "@/app/actions/share-message";

// The card sheet: a square Instagram image, pick a style, save or share.
//
// One sheet, two subjects. It was the profile card's alone; a class card is
// the same sheet pointed at a different route, so it takes the path and the
// words rather than a handle. Two copies of a theme picker, a share-file
// dance and a download fallback would have drifted the first time one of them
// gained a style.
export function ShareCardSheet({
  path,
  fileName,
  title,
  lead,
  alt,
  onClose,
  onToast,
  noThemes = false,
  linkUrl,
  linkTitle,
}: {
  /** The image route, without its query: "/api/card/matt". */
  path: string;
  fileName: string;
  title: string;
  lead: string;
  alt: string;
  onClose: () => void;
  onToast: (m: string) => void;
  /** A class with a photo: the card is the photo with white words, so a
   *  colour picker only offers shades of unreadable, by Matt's call. */
  noThemes?: boolean;
  /** Public classes can also be handed on as a link. Personal plans omit it. */
  linkUrl?: string;
  linkTitle?: string;
}) {
  // Ink by default: the card leads with a photo, and photos sit best on dark.
  const [themeId, setThemeId] = useState<StoryThemeId>("iron");
  const [styleOpen, setStyleOpen] = useState(false);
  const [canShareFiles, setCanShareFiles] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [peopleQuery, setPeopleQuery] = useState("");
  const [people, setPeople] = useState<ShareRecipient[]>([]);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [peoplePending, startPeople] = useTransition();
  // A fresh cache-buster per open; see ShareWeekSheet.
  const [bust] = useState(() => Date.now());

  useEffect(() => {
    setCanShareFiles(
      typeof navigator !== "undefined" &&
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function",
    );
  }, []);

  useEffect(() => {
    if (!peopleOpen || !linkUrl) return;
    const timer = window.setTimeout(() => {
      startPeople(async () => setPeople(await findShareRecipients(peopleQuery)));
    }, peopleQuery ? 180 : 0);
    return () => window.clearTimeout(timer);
  }, [peopleOpen, peopleQuery, linkUrl]);

  const cardUrl = `${path}?theme=${themeId}&v=${bust}-${themeId}`;
  const cardFileName = fileName;

  const shareCard = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      if (canShareFiles) {
        const res = await fetch(cardUrl);
        if (res.ok) {
          const file = new File([await res.blob()], cardFileName, { type: "image/png" });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file] });
            return;
          }
        }
      }
      const a = document.createElement("a");
      a.href = cardUrl;
      a.download = cardFileName;
      a.click();
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") onToast("Couldn't share the image");
    } finally {
      setSharing(false);
    }
  };

  const shareLink = async () => {
    if (!linkUrl) return;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: linkTitle ?? title, url: linkUrl });
        return;
      }
      await navigator.clipboard.writeText(linkUrl);
      onToast("Link copied, ready to paste");
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") onToast("Couldn't share the link");
    }
  };

  const emailLink = () => {
    if (!linkUrl) return;
    window.location.href = `mailto:?subject=${encodeURIComponent(linkTitle ?? title)}&body=${encodeURIComponent(linkUrl)}`;
  };

  const sendToPerson = (person: ShareRecipient) => {
    if (!linkUrl || sendingTo) return;
    setSendingTo(person.id);
    startPeople(async () => {
      const result = await sendClassShare(person.id, linkTitle ?? title, linkUrl);
      setSendingTo(null);
      if (!result.ok) return onToast(result.error ?? "Couldn’t send that class");
      onToast(`Sent to ${person.name}`);
      setPeopleOpen(false);
    });
  };

  return (
    <div className="sheet-scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet sheet-full">
        <div className="adderhead">
          <h2>{title}</h2>
          <button className="iconbtn sheetclose adderclose" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        </div>
        <p className="lead" style={{ marginTop: 0 }}>
          {lead}
        </p>
        {!noThemes && (
        <div className="storycustom">
          <label className="flabel" htmlFor="cardTheme">
            Style <span>· colors for the card</span>
          </label>
          <div className="stylepick">
            <button
              id="cardTheme"
              className="stylepick-btn"
              aria-haspopup="listbox"
              aria-expanded={styleOpen}
              onClick={() => setStyleOpen((v) => !v)}
            >
              <span
                className="swd"
                style={{ background: STORY_THEMES[themeId].bg, borderColor: STORY_THEMES[themeId].accent }}
              />
              <span className="stylepick-lbl">{STORY_THEMES[themeId].label}</span>
              <Icon name="expand_more" size={20} />
            </button>
            {styleOpen && (
              <div className="stylepick-menu" role="listbox" aria-label="Style">
                {(Object.entries(STORY_THEMES) as [StoryThemeId, (typeof STORY_THEMES)["paper"]][]).map(
                  ([id, t]) => (
                    <button
                      key={id}
                      role="option"
                      aria-selected={id === themeId}
                      className={`stylepick-row${id === themeId ? " sel" : ""}`}
                      onClick={() => {
                        setThemeId(id);
                        setStyleOpen(false);
                      }}
                    >
                      <span className="swd" style={{ background: t.bg, borderColor: t.accent }} />
                      <span className="stylepick-lbl">{t.label}</span>
                      {id === themeId && <Icon name="check" size={18} />}
                    </button>
                  ),
                )}
              </div>
            )}
          </div>
        </div>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="cardimg" src={cardUrl} alt={alt} />
        {linkUrl && (
          <div className="classshare-actions">
            <button type="button" onClick={() => setPeopleOpen((open) => !open)}>
              <span><Icon name="forum" size={23} /></span>
              Message
            </button>
            <button type="button" onClick={shareCard} disabled={sharing}>
              <span><Icon name="share" size={23} /></span>
              Instagram
            </button>
            <button type="button" onClick={emailLink}>
              <span><Icon name="mail" size={23} /></span>
              Email
            </button>
            <button type="button" onClick={shareLink}>
              <span><Icon name="content_copy" size={23} /></span>
              Copy link
            </button>
          </div>
        )}
        {peopleOpen && linkUrl && (
          <div className="classshare-people">
            <label><Icon name="search" size={19} /><input value={peopleQuery} onChange={(event) => setPeopleQuery(event.target.value)} autoFocus type="search" placeholder="Find someone on FittList" /></label>
            <div className="classshare-people-list" aria-busy={peoplePending}>
              {people.map((person) => (
                <button key={person.id} type="button" disabled={!!sendingTo} onClick={() => sendToPerson(person)}>
                  <span className="classshare-avatar" style={{ background: person.color ?? "#777" }}>
                    {person.photo ? <img src={person.photo} alt="" /> : (person.name.trim().charAt(0) || "?").toUpperCase()}
                  </span>
                  <span><strong>{person.name}</strong><small>@{person.handle}</small></span>
                  {sendingTo === person.id ? "Sending…" : "Send"}
                </button>
              ))}
              {!peoplePending && people.length === 0 && <p>No people found.</p>}
            </div>
          </div>
        )}
        {/* Share leads, save is the quiet one. See ShareComposer: the filled
            button used to say Save and open the share sheet. */}
        <div className="publishwrap">
          <button className="btn" disabled={sharing} onClick={shareCard}>
            {sharing ? "Opening…" : "Share image"}
          </button>
          <a className="btn ghost" style={{ marginTop: 8 }} href={cardUrl} download={cardFileName}>
            Save image
          </a>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { STORY_THEMES, type StoryThemeId } from "@/lib/format";
import { disconnectGoogleAction } from "@/app/actions/google";
import { updateProfile } from "@/app/actions/profile";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";

// The trainer's "My page" — profile, stats, shareable link, and story image —
// shown as a dismissable bottom sheet reached from the user icon.
export function ProfileSheet({
  handle,
  name,
  title,
  about,
  instagram,
  website,
  photo,
  visits,
  subsCount,
  classCount,
  googleConfigured,
  googleConnected,
  googleEmail,
  onClose,
}: {
  handle: string;
  name: string;
  title: string;
  about: string;
  instagram: string;
  website: string;
  photo: string | null;
  visits: number;
  subsCount: number;
  classCount: number;
  googleConfigured: boolean;
  googleConnected: boolean;
  googleEmail: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [toastMsg, toastOn, toast] = useToast();
  const [shareOpen, setShareOpen] = useState(false);
  const [shareSpan, setShareSpan] = useState<"week" | "day">("week");
  const [storyThemeId, setStoryThemeId] = useState<StoryThemeId>("iron");
  const [canShareFiles, setCanShareFiles] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [webcalUrl, setWebcalUrl] = useState("");
  const [connected, setConnected] = useState(googleConnected);
  const [disconnecting, startDisconnect] = useTransition();
  // profile editing
  const [editOpen, setEditOpen] = useState(false);
  const [pName, setPName] = useState(name);
  const [pTitle, setPTitle] = useState(title);
  const [pAbout, setPAbout] = useState(about);
  const [pInstagram, setPInstagram] = useState(instagram);
  const [pWebsite, setPWebsite] = useState(website);
  const [pPhoto, setPPhoto] = useState<string | null>(photo);
  const [saving, startSaving] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const url = `fittlist.co/${handle}`;

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

  // The subscribe feed lives at /api/cal/{handle}; build the URL once mounted
  // (the deployed host isn't known at build time). Used for Apple/Outlook.
  useEffect(() => {
    setWebcalUrl(`webcal://${window.location.host}/api/cal/${handle}`);
  }, [handle]);

  const disconnectGcal = () =>
    startDisconnect(async () => {
      await disconnectGoogleAction();
      setConnected(false);
      toast("Google Calendar disconnected");
    });
  const storyUrl = `/api/story/${handle}?span=${shareSpan}&theme=${storyThemeId}`;
  const storyFileName = `fittlist-${handle}-${shareSpan}-${storyThemeId}.png`;

  // File-sharing support (the native share sheet is the only route into
  // the iOS photo library from the web) is detectable only client-side.
  useEffect(() => {
    setCanShareFiles(
      typeof navigator !== "undefined" &&
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function",
    );
  }, []);

  const fetchStoryFile = async () => {
    const res = await fetch(storyUrl);
    if (!res.ok) throw new Error("story fetch failed");
    const blob = await res.blob();
    return new File([blob], storyFileName, { type: "image/png" });
  };

  // Opens the native share sheet with the PNG attached. On iPhone,
  // "Save Image" there writes it to Photos; it's also the path to an
  // Instagram story. Fallback: plain download.
  const shareStory = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      if (canShareFiles) {
        const file = await fetchStoryFile();
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file] });
          return;
        }
      }
      const a = document.createElement("a");
      a.href = storyUrl;
      a.download = storyFileName;
      a.click();
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") toast("Couldn't share the image");
    } finally {
      setSharing(false);
    }
  };

  const copy = async () => {
    // Copy the real deployed origin — before the fittlist.co domain is
    // attached, a hardcoded https://fittlist.co link would be dead.
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/${handle}`);
      toast("Link copied");
    } catch {
      toast(url);
    }
  };

  const copyCal = async () => {
    try {
      await navigator.clipboard.writeText(webcalUrl);
      toast("Calendar link copied");
    } catch {
      toast(webcalUrl);
    }
  };

  return (
    <>
      <div
        className="sheet-scrim"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="sheet">
          <button className="iconbtn sheetclose" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={16} />
          </button>
          <h2>My page</h2>
          <div className="profrow">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="profrow-photo" src={photo} alt="" />
            ) : (
              <div className="profrow-photo profrow-empty" aria-hidden="true">
                {(name.trim().charAt(0) || "?").toUpperCase()}
              </div>
            )}
            <div className="profrow-info">
              <div className="profrow-name">{name}</div>
              <div className="profrow-sub">{about?.trim() || "Add a short bio"}</div>
            </div>
            <button
              className="profrow-edit"
              onClick={() => {
                setPName(name);
                setPTitle(title);
                setPAbout(about);
                setPInstagram(instagram);
                setPWebsite(website);
                setPPhoto(photo);
                setEditOpen(true);
              }}
            >
              Edit
            </button>
          </div>
          <div className="statgrid">
            <div className="stat">
              <div className="n">{visits}</div>
              <div className="l">visits</div>
              <div className="d">{visits ? "this week" : ""}</div>
            </div>
            <div className="stat">
              <div className="n">{subsCount}</div>
              <div className="l">on your list</div>
              <div className="d">{subsCount ? "get emails" : ""}</div>
            </div>
            <div className="stat">
              <div className="n">{classCount}</div>
              <div className="l">classes</div>
              <div className="d"></div>
            </div>
          </div>
          <div className="linkcard">
            <div className="eyebrow">Your link</div>
            <div className="url">{url}</div>
            <button className="btn si" onClick={copy}>
              Copy link
            </button>
            <div className="hint">
              {classCount
                ? `${subsCount || "No"} ${subsCount === 1 ? "person" : "people"} on your list so far. Every schedule change emails them automatically.`
                : "Your link shows an empty week until you add a class. Drop it in your bio anyway — it never goes stale."}
            </div>
          </div>
          <a className="rowcta" href={`/${handle}`} target="_blank" rel="noopener">
            <span className="ig"><Icon name="visibility" size={22} /></span>
            <span>
              <span className="t">Preview your page</span>
              <br />
              <span className="s">Exactly what someone sees when they tap your bio</span>
            </span>
          </a>
          <button className="rowcta" onClick={() => setShareOpen(true)}>
            <span className="ig"><Icon name="share" size={22} /></span>
            <span>
              <span className="t">Share your week</span>
              <br />
              <span className="s">A story image with your link on it</span>
            </span>
          </button>
          {googleConfigured &&
            (connected ? (
              <div className="rowcta gcal-on">
                <span className="ig"><Icon name="event_available" size={22} /></span>
                <span>
                  <span className="t">Google Calendar connected</span>
                  <br />
                  <span className="s">
                    {googleEmail ? `Syncing to ${googleEmail}` : "Your classes auto-sync on every change"}
                  </span>
                </span>
                <button className="gcal-off" disabled={disconnecting} onClick={disconnectGcal}>
                  {disconnecting ? "…" : "Disconnect"}
                </button>
              </div>
            ) : (
              <a className="rowcta" href="/api/google/connect">
                <span className="ig"><Icon name="event" size={22} /></span>
                <span>
                  <span className="t">Connect Google Calendar</span>
                  <br />
                  <span className="s">Auto-sync your classes into your calendar</span>
                </span>
              </a>
            ))}
          <button className="calcopy" onClick={copyCal}>
            Apple or Outlook? Copy your calendar feed link
          </button>
        </div>
      </div>

      {shareOpen && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShareOpen(false);
          }}
        >
          <div className="sheet">
            <button
              className="iconbtn sheetclose"
              aria-label="Close"
              onClick={() => setShareOpen(false)}
            >
              <Icon name="close" size={16} />
            </button>
            <h2>Your story image</h2>
            <div className="share-toggles">
              <div className="seg">
                <button
                  className={shareSpan === "week" ? "sel" : ""}
                  onClick={() => setShareSpan("week")}
                >
                  My week
                </button>
                <button
                  className={shareSpan === "day" ? "sel" : ""}
                  onClick={() => setShareSpan("day")}
                >
                  Today
                </button>
              </div>
            </div>
            <div className="chips" style={{ justifyContent: "center" }}>
              {(Object.entries(STORY_THEMES) as [StoryThemeId, (typeof STORY_THEMES)["iron"]][]).map(
                ([id, t]) => (
                  <button
                    key={id}
                    className={`chip themechip${storyThemeId === id ? " sel" : ""}`}
                    onClick={() => setStoryThemeId(id)}
                  >
                    <span className="swd" style={{ background: t.bg, borderColor: t.accent }} />
                    {t.label}
                  </button>
                ),
              )}
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="storyimg"
              src={storyUrl}
              alt={`Story image of ${shareSpan === "week" ? "this week's" : "today's"} classes`}
            />
            <div className="publishwrap">
              {canShareFiles ? (
                <button className="btn" disabled={sharing} onClick={shareStory}>
                  {sharing ? "Opening…" : "Save image"}
                </button>
              ) : (
                <a className="btn" href={storyUrl} download={storyFileName}>
                  Save image
                </a>
              )}
              <button
                className="btn ghost"
                style={{ marginTop: 8 }}
                disabled={sharing}
                onClick={shareStory}
              >
                Share image
              </button>
            </div>
          </div>
        </div>
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

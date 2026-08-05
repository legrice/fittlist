"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { getStoryPrefs, setStoryPrefs } from "@/app/actions/profile";
import { shareRows, type ShareRow } from "@/app/actions/share";
import { STORY_THEMES, type StoryThemeId } from "@/lib/format";
import type { ShareKind } from "@/lib/shareweek";
import type { LastUsed, StudioDto, TemplateDto } from "@/lib/types";
import { Adder } from "@/components/Adder";
import { BackLink } from "@/components/BackLink";
import { Icon } from "@/components/Icon";
import { StoryPreview } from "@/components/StoryPreview";
import { Toast, useToast } from "@/components/Toast";

// The Share tab's editor.
//
// This is the coach's old "Share your schedule" sheet, promoted to the tab and
// given the one control it never had. It replaced a full-screen composer with
// a collapsing drawer, which was more screen than the job needs: everything
// here fits in one scroll, so nothing is behind a pull and the picture is the
// thing you scroll to rather than the thing you uncover. Two edits came with
// the move, both Matt's call:
//
//   * My week / Today is gone, and the Classes picker stands in its place. A
//     range was the wrong question: the answer is "the coming week" nearly
//     every time, and what people actually want to change is which classes are
//     on the picture. That control also adds, which is what makes this screen
//     the place calendars and the studio catalog get filled in.
//   * The headline field is gone. It maps from the hat and nothing else can
//     set it here.

/**
 * What the picture says at the top, and the whole of what it can say.
 *
 * The composer sends it explicitly rather than letting the route fall back to
 * `storyPrefs`: a coach who typed one into the old sheet still has it stored,
 * and inheriting it would put their Coaching words over a Going picture.
 */
const HEADLINE: Record<ShareKind, string> = {
  coaching: "Come train with me",
  going: "My week",
};

/** The window the picture draws. There is no control for it: a start date and
 *  a length were two questions whose answer was "this coming week" almost
 *  every time, and the Classes picker is the honest version of the one thing
 *  people wanted them for. */
const SPAN_DAYS = 7;

export function ShareComposer({
  canCoach,
  hasPhoto,
  today,
  firstIso,
  studios,
  templates,
  customTypes,
  lastUsed,
}: {
  /** A member has one hat, so the segment would be a control with one option.
   *  It is removed rather than disabled, and their model stays as simple as it
   *  should be. */
  canCoach: boolean;
  hasPhoto: boolean;
  today: string;
  /** The first day their week holds something, so the picture opens on a week
   *  rather than on an empty one they have to work out. */
  firstIso: string;
  /** The adder's ingredients. Making the picture and keeping the calendar are
   *  the same act here: a class typed into the classes sheet lands on the
   *  calendar, and when a studio was named it lands in that studio's catalog
   *  too, so the next person to add it gets the details already filled in. */
  studios: StudioDto[];
  templates: TemplateDto[];
  customTypes: string[];
  lastUsed: LastUsed;
}) {
  const router = useRouter();
  const [toastMsg, toastOn, toast] = useToast();

  const [kind, setKind] = useState<ShareKind>(canCoach ? "coaching" : "going");
  const [themeId, setThemeId] = useState<StoryThemeId>("paper");
  const [styleOpen, setStyleOpen] = useState(false);
  const [showPhoto, setShowPhoto] = useState(true);

  const [rows, setRows] = useState<ShareRow[] | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [picker, setPicker] = useState(false);
  const [adding, setAdding] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [canShareFiles, setCanShareFiles] = useState(false);
  // Adding a class changes the week without changing a single control, so the
  // picture has no reason of its own to redraw. This is that reason.
  const [bust, setBust] = useState(0);

  const from = firstIso > today ? firstIso : today;
  const headline = HEADLINE[kind];

  useEffect(() => {
    setCanShareFiles(
      typeof navigator !== "undefined" &&
        typeof navigator.share === "function" &&
        typeof navigator.canShare === "function",
    );
    getStoryPrefs().then((p) => setShowPhoto(p.showPhoto));
  }, []);

  // The rows behind the count and the picker. Never filtered on the client:
  // the picture is drawn from the same loader on the server, and two filters
  // would drift.
  const load = useCallback(() => {
    let live = true;
    setRows(null);
    shareRows({ kind, from, days: SPAN_DAYS }).then((r) => {
      if (live) setRows(r);
    });
    return () => {
      live = false;
    };
  }, [kind, from, bust]);
  useEffect(load, [load]);

  const shown = (rows ?? []).filter((r) => !hidden.has(r.key));
  const bare = rows !== null && shown.length === 0;

  const q = new URLSearchParams({
    kind,
    theme: themeId,
    from,
    days: String(SPAN_DAYS),
    headline,
    photo: showPhoto ? "1" : "0",
  });
  const hideList = [...hidden].join(",");
  if (hideList) q.set("hide", hideList);
  if (bust) q.set("v", String(bust));
  const src = `/api/story/compose?${q.toString()}`;
  const fileName = `fittlist-${kind}-${themeId}.png`;

  const pickKind = (k: ShareKind) => {
    setKind(k);
    // A hidden class belongs to the list it was hidden from; carrying the
    // keys across would silently drop rows from a week nobody had looked at.
    setHidden(new Set());
  };

  const togglePhoto = async () => {
    const v = !showPhoto;
    setShowPhoto(v);
    await setStoryPrefs({ showPhoto: v });
  };

  const shareStory = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      if (canShareFiles) {
        const res = await fetch(src);
        if (res.ok) {
          const file = new File([await res.blob()], fileName, { type: "image/png" });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file] });
            return;
          }
        }
      }
      const a = document.createElement("a");
      a.href = src;
      a.download = fileName;
      a.click();
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") toast("Couldn't share the image");
    } finally {
      setSharing(false);
    }
  };

  // An empty range is an offer, not a broken picture. A coach with an empty
  // week almost never has an empty week; they have a stale calendar, so the
  // ask is to add one. A member's calendar does not depend on coaches, so
  // theirs leads with their own.
  const emptyCta = kind === "coaching" ? "Add a class you coach" : "Add something to your week";

  return (
    <div className="composer">
      <div className="adderhead">
        <h2>Share your schedule</h2>
        {/* Opened from the tab bar there is always something beneath, and
            `anywhere` pops to it; typed cold there is not, and the feed is
            the honest fallback rather than a dead button. */}
        <BackLink className="iconbtn sheetclose adderclose" href="/feed" anywhere label="Close">
          <Icon name="close" size={16} />
        </BackLink>
      </div>

      {canCoach && (
        <div className="share-toggles">
          <div className="seg">
            <button
              className={kind === "coaching" ? "sel" : ""}
              onClick={() => pickKind("coaching")}
            >
              Coaching
            </button>
            <button className={kind === "going" ? "sel" : ""} onClick={() => pickKind("going")}>
              Going
            </button>
          </div>
        </div>
      )}

      <div className="storycustom">
        {/* What is on the picture, and the way to put something new on it.
            This is where My week / Today used to be: a range was the wrong
            question, and this is the one people were really asking. */}
        <label className="flabel">
          Classes <span>· what goes on your image</span>
        </label>
        <button className="comprow" onClick={() => setPicker(true)}>
          <span className="comprow-t">
            {rows === null
              ? "Loading"
              : rows.length === 0
                ? "Nothing this week"
                : shown.length === rows.length
                  ? `All ${rows.length} showing`
                  : `${shown.length} of ${rows.length} showing`}
            <small>{rangeWords(from)}</small>
          </span>
          <span className="comprow-a">Edit ›</span>
        </button>

        <label className="flabel" htmlFor="stTheme">
          Style <span>· colours for your image</span>
        </label>
        <div className="stylepick">
          <button
            id="stTheme"
            className="stylepick-btn"
            aria-haspopup="listbox"
            aria-expanded={styleOpen}
            onClick={() => setStyleOpen((v) => !v)}
          >
            <span
              className="swd"
              style={{
                background: STORY_THEMES[themeId].bg,
                borderColor: STORY_THEMES[themeId].accent,
              }}
            />
            <span className="stylepick-lbl">{STORY_THEMES[themeId].label}</span>
            <Icon name="expand_more" size={18} />
          </button>
          {styleOpen && (
            <div className="stylepick-menu" role="listbox" aria-label="Style">
              {(
                Object.entries(STORY_THEMES) as [StoryThemeId, (typeof STORY_THEMES)["paper"]][]
              ).map(([id, t]) => (
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
                  {id === themeId && <Icon name="check" size={16} />}
                </button>
              ))}
            </div>
          )}
        </div>

        {hasPhoto && (
          <button className="storyphoto" onClick={togglePhoto} aria-pressed={showPhoto}>
            <span>Show my photo</span>
            <span className={`switch${showPhoto ? " on" : ""}`} aria-hidden="true">
              <span className="switch-knob" />
            </span>
          </button>
        )}
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <StoryPreview src={src} alt="Story image of your week" bg={STORY_THEMES[themeId].bg} />

      <div className="publishwrap">
        {bare ? (
          <button
            className="btn compwarn"
            onClick={() => router.push(kind === "coaching" ? "/app?add=1" : "/week?add=1")}
          >
            {emptyCta}
          </button>
        ) : (
          <>
            {/* Share leads. It is the act this whole screen exists to end on,
                and the two used to be one handler behind two words, so the
                filled button said Save and opened the share sheet. Save is a
                plain download link now: it never opens the share sheet, which
                is the only thing that made it a second button worth having. */}
            <button className="btn" disabled={sharing || rows === null} onClick={shareStory}>
              {sharing ? "Opening…" : "Share image"}
            </button>
            <a className="btn ghost" style={{ marginTop: 8 }} href={src} download={fileName}>
              Save image
            </a>
          </>
        )}
      </div>

      {picker && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPicker(false);
          }}
        >
          <div className="sheet">
            <button
              className="iconbtn sheetclose"
              aria-label="Close"
              onClick={() => setPicker(false)}
            >
              <Icon name="close" size={16} />
            </button>
            <h2>Classes on your image</h2>
            <p className="lead">{rangeWords(from)}</p>
            {rows && rows.length > 0 ? (
              <div className="settingslist">
                {rows.map((r) => {
                  const on = !hidden.has(r.key);
                  return (
                    <button
                      key={r.key}
                      className="setrow"
                      aria-pressed={on}
                      onClick={() =>
                        setHidden((h) => {
                          const n = new Set(h);
                          if (n.has(r.key)) n.delete(r.key);
                          else n.add(r.key);
                          return n;
                        })
                      }
                    >
                      <span className="setrow-txt">
                        <span className="t">
                          {r.when} · {r.name}
                        </span>
                        {r.sub && <span className="s">{r.sub}</span>}
                      </span>
                      <span className={`compcheck${on ? " on" : ""}`} aria-hidden="true">
                        {on && <Icon name="check" size={14} />}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="lead">Nothing on your calendar this week yet.</p>
            )}
            {/* The point of the whole screen. Picking what goes on the image
                and keeping your calendar are the same list, so doing one does
                the other: a class typed here lands on the calendar, and when a
                studio was named it lands in that studio's catalog too, which is
                how a studio that isn't here yet arrives with a real class
                already on it. */}
            <button className="compadd" onClick={() => setAdding(true)}>
              + Add a class
            </button>
            <p className="compnote">
              Unchecking hides a class from the image. It stays on your calendar.
              Anything you add here is added to your calendar too.
            </p>
            <div className="publishwrap">
              <button className="btn" onClick={() => setPicker(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {adding && (
        <Adder
          studios={studios}
          templates={templates}
          customTypes={customTypes}
          lastUsed={lastUsed}
          subsCount={0}
          firstPublish={false}
          // Which hat you are wearing decides which form you get: the
          // Coaching picture is made of classes you publish, the Going one of
          // classes you attend. Asking again here would be asking a question
          // the segment above has already answered.
          personal={kind === "going" ? { canCoach: false } : undefined}
          onClose={() => setAdding(false)}
          onToast={toast}
          onPublished={(msg) => {
            setAdding(false);
            // The week changed under a picture whose controls did not, so the
            // redraw has to be asked for.
            setBust((n) => n + 1);
            toast(msg);
          }}
          onDeleted={(msg) => {
            setAdding(false);
            setBust((n) => n + 1);
            toast(msg);
          }}
        />
      )}

      <Toast msg={toastMsg} on={toastOn} />
    </div>
  );
}

/** The week the picture covers, said the way a person would: "Aug 4 to Aug
 *  10". There is no control for it, so this is a statement rather than a
 *  confirmation of something that was picked. */
function rangeWords(from: string): string {
  const fmt = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  const last = new Date(Date.parse(`${from}T00:00:00Z`) + (SPAN_DAYS - 1) * 864e5)
    .toISOString()
    .slice(0, 10);
  return `${fmt(from)} to ${fmt(last)}`;
}

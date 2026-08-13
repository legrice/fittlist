"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LocationPicker } from "@/components/LocationPicker";
import { InviteSheet } from "@/components/InviteFriends";
import { updateProfile } from "@/app/actions/profile";
import { cityFromCoordinates, completeOnboarding, suggestedCoaches } from "@/app/actions/onboarding";
import { setTeaching } from "@/app/actions/auth";
import { followTrainer, unfollowTrainer } from "@/app/actions/subscribe";
import { takeAfterAuth } from "@/lib/afterauth";
import { readPhotoPair } from "@/lib/photo";
import type { GeoPlace } from "@/lib/geocode";
import { STUDIO_TYPES } from "@/lib/studio";

const COACH_TITLES: Record<string, string> = {
  Yoga: "Yoga teacher",
  Strength: "Strength coach",
  Pilates: "Pilates instructor",
  Boxing: "Boxing coach",
  Cycling: "Cycling instructor",
  "Run club": "Run coach",
  Dance: "Dance instructor",
  Mobility: "Mobility coach",
  "Personal training": "Personal trainer",
};

/** Somebody worth following on the way in: loaded when the follow step
 *  opens, so the place picked on the page before can rank them by
 *  nearness. */
export type SuggestedCoach = {
  id: string;
  handle: string;
  name: string;
  photo: string | null;
  color: string;
  /** Their tagline, or nothing: the row survives an empty one. */
  sub: string;
};

// The post-signup wizard, one shape for everyone, by Matt's call. The
// username came first (AuthFlow's claim step), and then four pages here:
//
//   1. Do you teach? The role question moved here from the signup sheet:
//      asking before the account exists made the very first screen a form,
//      and the answer is one tap that can change later in settings anyway
//      (setTeaching is the same switch either way).
//   2. Location: a required city on its own, because every nearby result
//      depends on it. The browser can fill it after permission.
//   3. About you: coaches first identify what they teach, then everyone can
//      add a photo and a few words. The details are optional, the coach's
//      primary category is not.
//   4. Follow a few local coaches: the act the whole member side waits on,
//      offered while the app is still empty. Skippable in as many words.
//
// The studio-picking step is gone: publishing a class already writes the
// association, so the wizard was asking for something the adder learns
// anyway. The contact fields went to settings for the same reason: an
// onboarding is for what the app cannot work without.
export function OnboardingWizard({
  landing = "/feed",
  name,
  photo,
  title,
  about,
  location,
}: {
  landing?: string;
  name: string;
  photo: string | null;
  title: string;
  about: string;
  location: string;
}) {
  const router = useRouter();
  const TOTAL = 4;
  const [step, setStep] = useState(1);
  // Null until they answer: the Continue under the cards stays off, because
  // the whole point of moving the question here is that it gets answered.
  const [teach, setTeach] = useState<boolean | null>(null);
  const [pPhoto, setPPhoto] = useState<string | null>(photo);
  const [pThumb, setPThumb] = useState<string | null>(null);
  const [pTitle, setPTitle] = useState(title);
  const [pAbout, setPAbout] = useState(about);
  const [pLocation, setPLocation] = useState(location);
  // The picked place's point. Typed-but-unpicked text saves too (the server
  // geocodes it best-effort); the point is what ranks the next page.
  const [pPlace, setPPlace] = useState<GeoPlace | null>(null);
  const [primaryCategory, setPrimaryCategory] = useState("");
  const [otherPrimary, setOtherPrimary] = useState("");
  const [otherCategories, setOtherCategories] = useState<string[]>([]);
  const [suggested, setSuggested] = useState<SuggestedCoach[] | null>(null);
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [locating, setLocating] = useState(false);
  const [skipWarning, setSkipWarning] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pickPhoto = (file: File) =>
    readPhotoPair(file, (full, thumb) => {
      setPPhoto(full);
      setPThumb(thumb);
    });

  // Save everything and land in the app. Reached only through the follow
  // step's own button, so the teach answer always exists by now.
  const finish = () => {
    setError("");
    if (!pLocation.trim()) {
      setStep(2);
      setError("Add your city first. It's how people find you.");
      return;
    }
    startTransition(async () => {
      const res = await updateProfile({
        name,
        title: pTitle,
        about: pAbout,
        location: pLocation,
        locationLat: pPlace?.lat ?? null,
        locationLng: pPlace?.lng ?? null,
        // Untouched here: they moved to settings, and updateProfile writes
        // what it is handed.
        instagram: "",
        website: "",
        photo: pPhoto,
        photoThumb: pThumb,
        disciplines: teach
          ? [primaryCategory === "Other" ? otherPrimary : primaryCategory, ...otherCategories]
          : [],
      });
      if (!res.ok) {
        setError(res.error ?? "Couldn't save. Try again.");
        return;
      }
      await setTeaching(!!teach);
      await completeOnboarding();
      // Back to whatever they were part way through, if signing in was in
      // the middle of something; otherwise each side's own front door.
      router.push(takeAfterAuth() ?? (teach ? "/calendar" : landing));
      router.refresh();
    });
  };

  const saveLocation = () => {
    setError("");
    if (!pLocation.trim()) {
      setError("Add your city first. It's how people find you.");
      return;
    }
    setStep(3);
  };

  const toFollowStep = () => {
    setError("");
    const primary = primaryCategory === "Other" ? otherPrimary.trim() : primaryCategory;
    if (teach && !primary) {
      setError("Choose the primary category you teach.");
      return;
    }
    if (teach) setPTitle(COACH_TITLES[primary] ?? primary);
    setSkipWarning(false);
    setStep(4);
    suggestedCoaches(pLocation)
      .then(setSuggested)
      .catch(() => setSuggested([]));
  };

  const useMyLocation = () => {
    if (!navigator.geolocation || locating) return;
    setError("");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        cityFromCoordinates(pos.coords.latitude, pos.coords.longitude)
          .then((res) => {
            if (res.ok && res.location) {
              setPLocation(res.location);
              setPPlace({ label: res.location, lat: res.lat!, lng: res.lng! });
            } else setError("We couldn't find your city. Type it below instead.");
          })
          .finally(() => setLocating(false));
      },
      () => {
        setLocating(false);
        setError("Location access didn't work. Type your city below instead.");
      },
      { enableHighAccuracy: false, timeout: 8000 },
    );
  };

  const toggleFollow = (c: SuggestedCoach) => {
    if (pending) return;
    startTransition(async () => {
      if (followed.has(c.id)) {
        const res = await unfollowTrainer(c.handle);
        if (!res.ok) return;
        setFollowed((cur) => {
          const next = new Set(cur);
          next.delete(c.id);
          return next;
        });
      } else {
        const res = await followTrainer(c.handle);
        if (!res.ok) return;
        setFollowed((cur) => new Set(cur).add(c.id));
      }
    });
  };

  return (
    <section className="screen wiz">
      <div className="pad">
        <div className="wiztop">
          <div className="wizdots" aria-hidden="true">
            {Array.from({ length: TOTAL }, (_, i) => (
              <span key={i} className={`wizdot${i + 1 === step ? " on" : ""}${i + 1 < step ? " done" : ""}`} />
            ))}
          </div>
        </div>

        {step === 1 && (
          <>
            <h1>How do you use fitness?</h1>
            <p>You can change this later in your profile.</p>
            <button
              type="button"
              className={`teachcard${teach === true ? " sel" : ""}`}
              aria-pressed={teach === true}
              onClick={() => setTeach(true)}
            >
              <span className="teachcard-t">Yes, I teach</span>
              <span className="teachcard-s">You get a calendar, a shareable page, and followers.</span>
            </button>
            <button
              type="button"
              className={`teachcard${teach === false ? " sel" : ""}`}
              aria-pressed={teach === false}
              onClick={() => setTeach(false)}
            >
              <span className="teachcard-t">I just take classes</span>
              <span className="teachcard-s">Follow coaches and see everyone&rsquo;s week in one place.</span>
            </button>
            <div className="wizfoot">
              <button className="btn si" disabled={teach === null} onClick={() => setStep(2)}>
                Continue
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h1>Where are you based?</h1>
            <p>Your city helps us show you coaches and classes nearby.</p>
            <button className="btn ghost wizlocate" type="button" onClick={useMyLocation} disabled={locating}>
              {locating ? "Finding your city…" : "Use my location"}
            </button>
            <label className="flabel" htmlFor="wLocation">City and state</label>
            <LocationPicker
              id="wLocation"
              value={pLocation}
              onChange={(v, place) => {
                setPLocation(v);
                setPPlace(place);
              }}
            />
            <div className="wizfoot">
              <button className="btn si" onClick={saveLocation} disabled={pending || !pLocation.trim()}>
                Continue
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h1>About you.</h1>
            <p>{teach ? "What do you teach? Then add a face and a few words." : "Add a face and a few words so people know who they're making plans with."}</p>
            {teach && (
              <div className="wizcategories">
                <label className="flabel" htmlFor="wPrimary">Primary category</label>
                <select
                  id="wPrimary"
                  className="editinput"
                  value={primaryCategory}
                  onChange={(e) => setPrimaryCategory(e.target.value)}
                >
                  <option value="">Choose one</option>
                  {STUDIO_TYPES.map((type) => <option key={type} value={type}>{COACH_TITLES[type] ?? type}</option>)}
                  <option value="Other">Other</option>
                </select>
                {primaryCategory === "Other" && (
                  <input
                    className="editinput wizother"
                    value={otherPrimary}
                    maxLength={40}
                    placeholder="How would you describe what you teach?"
                    onChange={(e) => setOtherPrimary(e.target.value)}
                  />
                )}
                <span className="flabel">Other categories <span>· optional</span></span>
                <div className="wizcategory-grid">
                  {STUDIO_TYPES.filter((type) => type !== primaryCategory).map((type) => {
                    const on = otherCategories.includes(type);
                    return (
                      <button
                        key={type}
                        type="button"
                        className={`wizcategory${on ? " on" : ""}`}
                        aria-pressed={on}
                        onClick={() => setOtherCategories((cur) => on ? cur.filter((x) => x !== type) : cur.length < 3 ? [...cur, type] : cur)}
                      >
                        {type}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="wizphoto wizphoto-row">
              {pPhoto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="wizphoto-img" src={pPhoto} alt="" />
              ) : (
                <div className="wizphoto-img wizphoto-empty" aria-hidden="true">
                  {(name.trim().charAt(0) || "?").toUpperCase()}
                </div>
              )}
              <div className="wizphoto-actions">
                <button className="btn ghost" onClick={() => fileRef.current?.click()}>
                  {pPhoto ? "Change photo" : "Add a photo"}
                </button>
                {pPhoto && (
                  <button
                    className="linktoggle"
                    onClick={() => {
                      setPPhoto(null);
                      setPThumb(null);
                    }}
                  >
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
            <label className="flabel" htmlFor="wTitle">
              {teach ? "Profile title" : "Tagline"} <span>· optional</span>
            </label>
            <input
              id="wTitle"
              className="editinput"
              value={pTitle}
              maxLength={80}
              placeholder={teach ? (COACH_TITLES[primaryCategory] ?? "Strength coach") : "Lifts heavy, runs slow"}
              onChange={(e) => setPTitle(e.target.value)}
            />
            <label className="flabel" htmlFor="wAbout">
              About <span>· a line or two about you</span>
            </label>
            <textarea
              id="wAbout"
              className="abouttext"
              value={pAbout}
              maxLength={600}
              rows={4}
              placeholder={
                teach
                  ? "Coach at Ironbound Performance. Strength & conditioning, all levels."
                  : "Train mostly at Ironbound. Strength three mornings a week, yoga when I can."
              }
              onChange={(e) => setPAbout(e.target.value)}
            />
            <div className="wizfoot">
              <button
                className="btn si"
                onClick={toFollowStep}
                disabled={pending || (!!teach && (!primaryCategory || (primaryCategory === "Other" && !otherPrimary.trim())))}
              >
                Continue
              </button>
              <button className="wizskip" type="button" onClick={() => setSkipWarning(true)} disabled={pending}>
                Skip for now
              </button>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <h1>Follow a few coaches near you.</h1>
            <p>Coaches in {pLocation.split(",")[0]} with classes coming up.</p>
            {suggested !== null && suggested.length === 0 && (
              <div className="wizinvite-empty">
                <h2>No coaches nearby yet</h2>
                <p>Know someone who teaches in {pLocation.split(",")[0]}? Invite them to put their week on FittList.</p>
                <button className="btn si" type="button" onClick={() => setInviteOpen(true)}>
                  Invite a coach
                </button>
              </div>
            )}
            {suggested === null && (
              <div className="obfollist" aria-busy="true">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="obfolrow">
                    <span className="skel obfolrow-av" />
                    <span className="obfolrow-txt">
                      <span className="skel" style={{ width: "52%", height: 16 }} />
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="obfollist">
              {(suggested ?? []).map((c) => {
                const on = followed.has(c.id);
                return (
                  <div key={c.id} className="obfolrow">
                    {c.photo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="obfolrow-av" src={c.photo} alt="" />
                    ) : (
                      <span className="obfolrow-av obfolrow-av-empty" style={{ background: c.color }}>
                        {(c.name.trim().charAt(0) || "?").toUpperCase()}
                      </span>
                    )}
                    <span className="obfolrow-txt">
                      <span className="nm">{c.name}</span>
                      {c.sub && <span className="sub">{c.sub}</span>}
                    </span>
                    <button
                      type="button"
                      className={`disfollow${on ? " on" : ""}`}
                      disabled={pending}
                      aria-label={on ? `Unfollow ${c.name}` : `Follow ${c.name}`}
                      onClick={() => toggleFollow(c)}
                    >
                      {on ? "Following" : "Follow"}
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="wizfoot">
              <button className="btn si" onClick={finish} disabled={pending}>
                {pending ? "Finishing…" : followed.size ? "Continue" : "Skip, I'll find people later"}
              </button>
            </div>
          </>
        )}

        {error && <div className="errorcopy">{error}</div>}
        {skipWarning && (
          <div className="sheet-scrim" onClick={(e) => e.target === e.currentTarget && setSkipWarning(false)}>
            <section className="sheet confirmsheet" role="dialog" aria-modal="true" aria-labelledby="skip-profile-title">
              <h2 id="skip-profile-title">Profiles help people find you</h2>
              <p>A photo and a few words make your profile feel local and real. It can even be your cat for now. You can always finish it later.</p>
              <button className="btn si" type="button" onClick={() => setSkipWarning(false)}>Add my details</button>
              <button className="confirm-keep" type="button" onClick={toFollowStep}>Skip anyway</button>
            </section>
          </div>
        )}
        {inviteOpen && <InviteSheet onClose={() => setInviteOpen(false)} />}
      </div>
    </section>
  );
}

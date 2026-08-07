"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LocationInput } from "@/components/LocationInput";
import { updateProfile } from "@/app/actions/profile";
import { completeOnboarding } from "@/app/actions/onboarding";
import { setTeaching } from "@/app/actions/auth";
import { followTrainer, unfollowTrainer } from "@/app/actions/subscribe";
import { takeAfterAuth } from "@/lib/afterauth";
import { readPhoto } from "@/lib/photo";

/** Somebody worth following on the way in: loaded by the welcome page. */
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
// username came first (AuthFlow's claim step), and then three pages here:
//
//   1. Do you teach? The role question moved here from the signup sheet:
//      asking before the account exists made the very first screen a form,
//      and the answer is one tap that can change later in settings anyway
//      (setTeaching is the same switch either way).
//   2. About you: photo, tagline, a line or two, and the one required
//      field, the city. Skippable except the city, which Discover needs.
//   3. Follow a few coaches: the act the whole member side waits on,
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
  suggested,
}: {
  landing?: string;
  name: string;
  photo: string | null;
  title: string;
  about: string;
  location: string;
  suggested: SuggestedCoach[];
}) {
  const router = useRouter();
  const TOTAL = 3;
  const [step, setStep] = useState(1);
  // Null until they answer: the Continue under the cards stays off, because
  // the whole point of moving the question here is that it gets answered.
  const [teach, setTeach] = useState<boolean | null>(null);
  const [pPhoto, setPPhoto] = useState<string | null>(photo);
  const [pTitle, setPTitle] = useState(title);
  const [pAbout, setPAbout] = useState(about);
  const [pLocation, setPLocation] = useState(location);
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const pickPhoto = (file: File) => readPhoto(file, setPPhoto);

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
        // Untouched here: they moved to settings, and updateProfile writes
        // what it is handed.
        instagram: "",
        website: "",
        photo: pPhoto,
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

  const toStep3 = () => {
    setError("");
    if (!pLocation.trim()) {
      setError("Add your city first. It's how people find you.");
      return;
    }
    setStep(3);
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
          {/* Only the middle page is skippable: the role question is the
              page, and the follow page carries its skip in its own button. */}
          {step === 2 && (
            <button className="wizskip" onClick={toStep3} disabled={pending}>
              Skip for now
            </button>
          )}
        </div>

        {step === 1 && (
          <>
            <h1>Do you teach?</h1>
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
            <h1>About you.</h1>
            <p>A face, a line, and your city. All of it can change later.</p>
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
            <label className="flabel" htmlFor="wTitle">
              {teach ? "Title" : "Tagline"} <span>· optional</span>
            </label>
            <input
              id="wTitle"
              className="editinput"
              value={pTitle}
              maxLength={80}
              placeholder={teach ? "Strength coach" : "Lifts heavy, runs slow"}
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
            {/* The one field here that isn't optional. Discover is organised
                by city, so a profile without one can't be browsed to. */}
            <label className="flabel" htmlFor="wLocation">
              Location <span>· city and state, required</span>
            </label>
            <LocationInput id="wLocation" value={pLocation} onChange={setPLocation} />
            <div className="wizfoot">
              <button className="btn si" onClick={toStep3} disabled={pending}>
                Continue
              </button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h1>Follow a few coaches.</h1>
            <p>Their weeks land on your Following tab. Skip if you&rsquo;d rather not.</p>
            {suggested.length === 0 && (
              <p className="microcopy">Nobody to suggest yet. You&rsquo;ll find people in Discover.</p>
            )}
            <div className="obfollist">
              {suggested.map((c) => {
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
      </div>
    </section>
  );
}

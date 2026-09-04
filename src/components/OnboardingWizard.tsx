"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { LocationPicker } from "@/components/LocationPicker";
import { Wordmark } from "@/components/Wordmark";
import { updateProfile } from "@/app/actions/profile";
import { cityFromCoordinates, completeOnboarding } from "@/app/actions/onboarding";
import { setTeaching } from "@/app/actions/auth";
import { readPhotoPair } from "@/lib/photo";
import type { GeoPlace } from "@/lib/geocode";

const TEACHING_TYPES = [
  "Strength",
  "Yoga",
  "Pilates",
  "Cycling",
  "Running",
  "Dance",
  "Boxing",
  "HIIT",
  "Mobility",
] as const;

/**
 * Post-signup setup is intentionally the same for everybody. Name and handle
 * are established by the account claim screen; this wizard only collects the
 * two pieces the product needs next: a city and a useful public identity.
 * Teaching is an optional attribute, never a separate account type.
 */
export function OnboardingWizard({
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
  const [step, setStep] = useState<1 | 2>(1);
  const [teach, setTeach] = useState(false);
  const [pPhoto, setPPhoto] = useState<string | null>(photo);
  const [pThumb, setPThumb] = useState<string | null>(null);
  const [pTitle, setPTitle] = useState(title);
  const [pAbout, setPAbout] = useState(about);
  const [pLocation, setPLocation] = useState(location);
  const [pPlace, setPPlace] = useState<GeoPlace | null>(null);
  const [teachingTypes, setTeachingTypes] = useState<string[]>([]);
  const [otherType, setOtherType] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [locating, setLocating] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const pickPhoto = (file: File) =>
    readPhotoPair(file, (full, thumb) => {
      setPPhoto(full);
      setPThumb(thumb);
    });

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
              setPPlace({
                label: res.location,
                lat: res.lat!,
                lng: res.lng!,
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              });
            } else {
              setError("We couldn't find your city. Type it below instead.");
            }
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

  const continueFromLocation = () => {
    if (!pLocation.trim()) {
      setError("Add your city first. It's how people find you.");
      return;
    }
    setError("");
    setStep(2);
  };

  const finish = () => {
    setError("");
    startTransition(async () => {
      try {
      const disciplines = teach
        ? [...teachingTypes, ...(otherType.trim() ? [otherType.trim()] : [])]
        : [];
      const res = await updateProfile({
        name,
        title: pTitle,
        about: pAbout,
        location: pLocation,
        locationLat: pPlace?.lat ?? null,
        locationLng: pPlace?.lng ?? null,
        timeZone:
          pPlace?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        instagram: "",
        website: "",
        photo: pPhoto,
        photoThumb: pThumb,
        disciplines,
      });
      if (!res.ok) {
        setError(res.error ?? "Couldn't save. Try again.");
        return;
      }
      const teaching = await setTeaching(teach);
      if (!teaching.ok) {
        setError(teaching.error ?? "Couldn't save your coaching choice. Try again.");
        return;
      }
      const completed = await completeOnboarding();
      if (!completed.ok) {
        setError(completed.error ?? "Couldn't finish setup. Try again.");
        return;
      }
      router.push("/calendar");
      router.refresh();
      } catch { setError("We couldn’t finish setup. Check your connection and try again."); }
    });
  };

  return (
    <section className="screen wiz">
      <div className="pad">
        <div className="wizbrandbar">
          <Wordmark variant="ink" className="wizbrand" />
          <span>{step} of 2</span>
        </div>
        {step === 2 && (
          <button className="wizback" type="button" onClick={() => setStep(1)} aria-label="Back">
            <Icon name="arrow_back" size={22} />
          </button>
        )}

        {step === 1 && (
          <>
            <h1>Where are you based?</h1>
            <p>Your city helps us show you people, places, and fitness nearby.</p>
            <label className="flabel" htmlFor="wLocation">City and state</label>
            <LocationPicker
              id="wLocation"
              value={pLocation}
              onChange={(value, place) => {
                setPLocation(value);
                setPPlace(place);
              }}
            />
            <button className="wizlocate" type="button" onClick={useMyLocation} disabled={locating}>
              <Icon name="explore" size={20} />
              <span>{locating ? "Finding your city…" : "Use my location"}</span>
            </button>
            <div className="wizfoot">
              <button className="btn si" onClick={continueFromLocation} disabled={!pLocation.trim()}>
                Continue
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h1>Tell us about you.</h1>
            <p>Add a face and a few words to make your page yours.</p>

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
                <button className="btn ghost" type="button" onClick={() => fileRef.current?.click()}>
                  {pPhoto ? "Change photo" : "Add a photo"}
                </button>
                {pPhoto && (
                  <button className="linktoggle" type="button" onClick={() => { setPPhoto(null); setPThumb(null); }}>
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
                  const file = e.target.files?.[0];
                  if (file) pickPhoto(file);
                  e.target.value = "";
                }}
              />
            </div>

            <label className="flabel" htmlFor="wTitle">Profile title <span>· optional</span></label>
            <input
              id="wTitle"
              className="editinput"
              value={pTitle}
              maxLength={80}
              placeholder="Strength coach, runner, weekend cyclist"
              onChange={(e) => setPTitle(e.target.value)}
            />
            <label className="flabel" htmlFor="wAbout">About <span>· optional</span></label>
            <textarea
              id="wAbout"
              className="abouttext"
              value={pAbout}
              maxLength={600}
              rows={4}
              placeholder="A line or two about you"
              onChange={(e) => setPAbout(e.target.value)}
            />

            <section className="wizteach">
              <h2>Do you teach fitness?</h2>
              <label className="switchrow">
                <span>
                  <strong>I teach fitness</strong>
                  <small>Turn this on to add what you teach to your profile.</small>
                </span>
                <input type="checkbox" checked={teach} onChange={(e) => setTeach(e.target.checked)} />
              </label>
              {teach && (
                <div className="wizcategories">
                  <span className="flabel">What do you teach? <span>Choose all that apply.</span></span>
                  <div className="wizcategory-grid">
                    {TEACHING_TYPES.map((type) => {
                      const on = teachingTypes.includes(type);
                      return (
                        <button
                          key={type}
                          type="button"
                          className={`wizcategory${on ? " on" : ""}`}
                          aria-pressed={on}
                          onClick={() => setTeachingTypes((current) => on ? current.filter((item) => item !== type) : [...current, type])}
                        >
                          {type}
                        </button>
                      );
                    })}
                  </div>
                  <label className="flabel" htmlFor="wOtherType">Other <span>· optional</span></label>
                  <input
                    id="wOtherType"
                    className="editinput"
                    value={otherType}
                    maxLength={40}
                    placeholder="What else do you teach?"
                    onChange={(e) => setOtherType(e.target.value)}
                  />
                </div>
              )}
            </section>

            <div className="wizfoot">
              <button className="btn si" onClick={finish} disabled={pending}>
                {pending ? "Finishing…" : "Finish setup"}
              </button>
            </div>
          </>
        )}

        {error && <div className="errorcopy">{error}</div>}
      </div>
    </section>
  );
}

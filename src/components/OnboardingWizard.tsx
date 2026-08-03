"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LocationInput } from "@/components/LocationInput";
import { updateProfile } from "@/app/actions/profile";
import { completeOnboarding, setCoachStudios } from "@/app/actions/onboarding";
import { createStudio } from "@/app/actions/studios";
import { takeAfterAuth } from "@/lib/afterauth";
import type { StudioDto } from "@/lib/types";
import { Icon } from "@/components/Icon";
import { readPhoto } from "@/lib/photo";



export function OnboardingWizard({
  kind = "coach",
  landing = "/feed",
  name,
  photo,
  title,
  about,
  location,
  instagram,
  website,
  contactEmail,
  phone,
  whatsapp,
  studios: studiosProp,
  selectedStudioIds,
}: {
  /** A member sets up a photo and a bio and stops there. The rest of this
   *  wizard is about being findable and bookable as a coach. */
  kind?: "coach" | "fan";
  /** Where finishing setup lands. The server computes it: Home is
   *  dark-launched, so it is Following for everyone but an admin. */
  landing?: string;
  name: string;
  photo: string | null;
  title: string;
  about: string;
  location: string;
  instagram: string;
  website: string;
  contactEmail: string;
  phone: string;
  whatsapp: string;
  studios: StudioDto[];
  selectedStudioIds: string[];
}) {
  const router = useRouter();
  const fan = kind === "fan";
  const TOTAL = fan ? 2 : 3;
  // Step 2 asks who you are, and that's where the city lives.
  const LOCATION_STEP = 2;
  const [step, setStep] = useState(1);
  const [pPhoto, setPPhoto] = useState<string | null>(photo);
  const [pTitle, setPTitle] = useState(title);
  const [pAbout, setPAbout] = useState(about);
  const [pLocation, setPLocation] = useState(location);
  const [pInstagram, setPInstagram] = useState(instagram);
  const [pWebsite, setPWebsite] = useState(website);
  const [pEmail, setPEmail] = useState(contactEmail);
  const [pPhone, setPPhone] = useState(phone);
  const [pWhatsapp, setPWhatsapp] = useState(whatsapp);
  const [studios, setStudios] = useState(studiosProp);
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedStudioIds));
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [nsName, setNsName] = useState("");
  const [nsAddr, setNsAddr] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const pickPhoto = (file: File) => readPhoto(file, setPPhoto);

  const toggleStudio = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return studios.filter(
      (s) => !q || s.name.toLowerCase().includes(q) || s.address.toLowerCase().includes(q),
    );
  }, [studios, search]);

  const addStudio = () => {
    if (!nsName.trim() || !nsAddr.trim()) return;
    setError("");
    startTransition(async () => {
      const res = await createStudio(nsName, nsAddr);
      if (!res.ok || !res.studio) {
        setError(res.error ?? "Couldn't add that studio");
        return;
      }
      setStudios((prev) => [...prev, res.studio!]);
      setSelected((prev) => new Set(prev).add(res.studio!.id));
      setNsName("");
      setNsAddr("");
      setAdding(false);
    });
  };

  // Save everything collected so far and drop the coach into the app. Used by
  // both "Finish" on the last step and "Skip for now" from anywhere. Every field
  // is optional, so this never blocks.
  const finish = () => {
    setError("");
    if (!pLocation.trim()) {
      setStep(LOCATION_STEP);
      setError("Add your city first. It's how people find you.");
      return;
    }
    startTransition(async () => {
      const res = await updateProfile({
        name,
        title: pTitle,
        about: pAbout,
        location: pLocation,
        instagram: pInstagram,
        website: pWebsite,
        contactEmail: pEmail,
        phone: pPhone,
        whatsapp: pWhatsapp,
        photo: pPhoto,
      });
      if (!res.ok) {
        setError(res.error ?? "Couldn't save. Try again.");
        return;
      }
      if (!fan) await setCoachStudios([...selected]);
      await completeOnboarding();
      // Back to whatever they were part way through, if signing in was in the
      // middle of something. Set on the way in by AuthFlow.
      router.push(takeAfterAuth() ?? (fan ? landing : "/app"));
      router.refresh();
    });
  };

  const next = () => {
    setError("");
    if (step === LOCATION_STEP && !pLocation.trim()) {
      setError("Add your city first. It's how people find you.");
      return;
    }
    if (step < TOTAL) setStep(step + 1);
    else finish();
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
          <button className="wizskip" onClick={finish} disabled={pending}>
            Skip for now
          </button>
        </div>

        {step === 1 && (
          <>
            <h1>Add a photo.</h1>
            <p>
              {fan
                ? "So the coaches you follow know who you are. You can change it anytime."
                : "A friendly face makes your page feel like you. You can change it anytime."}
            </p>
            <div className="wizphoto">
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
          </>
        )}

        {step === 2 && (
          <>
            <h1>Tell people who you are.</h1>
            <p>
              {fan
                ? "A line about you, so a coach knows who just followed them."
                : "A tagline and a couple of lines. Add the ways you want to be reached."}
            </p>
            <label className="flabel" htmlFor="wTitle">
              {fan ? "Tagline" : "Title"} <span>· {fan ? "optional" : "your role or tagline"}</span>
            </label>
            <input
              id="wTitle"
              className="editinput"
              value={pTitle}
              maxLength={80}
              placeholder={fan ? "Lifts heavy, runs slow" : "Strength coach"}
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
                fan
                  ? "Train mostly at Ironbound. Strength three mornings a week, yoga when I can."
                  : "Coach at Ironbound Performance. Strength & conditioning, all levels."
              }
              onChange={(e) => setPAbout(e.target.value)}
            />
            {/* The one field here that isn't optional. Discover is organised by
                city, so a profile without one can't be browsed to. */}
            <label className="flabel" htmlFor="wLocation">
              Location <span>· city and state, required</span>
            </label>
            <LocationInput id="wLocation" value={pLocation} onChange={setPLocation} />
            {!fan && (
            <>
            <label className="flabel" htmlFor="wInstagram">
              Instagram <span>· optional</span>
            </label>
            <div className="editprefix">
              <span className="editprefix-at">@</span>
              <input
                id="wInstagram"
                className="editinput"
                value={pInstagram}
                maxLength={40}
                placeholder="yourhandle"
                autoCapitalize="none"
                autoCorrect="off"
                onChange={(e) => setPInstagram(e.target.value)}
              />
            </div>
            <label className="flabel" htmlFor="wWebsite">
              Website <span>· optional</span>
            </label>
            <input
              id="wWebsite"
              type="url"
              className="editinput"
              value={pWebsite}
              maxLength={200}
              placeholder="yoursite.com"
              autoCapitalize="none"
              autoCorrect="off"
              onChange={(e) => setPWebsite(e.target.value)}
            />
            <label className="flabel" htmlFor="wEmail">
              Contact email <span>· optional</span>
            </label>
            <input
              id="wEmail"
              type="email"
              className="editinput"
              value={pEmail}
              maxLength={120}
              placeholder="you@example.com"
              autoCapitalize="none"
              autoCorrect="off"
              onChange={(e) => setPEmail(e.target.value)}
            />
            <label className="flabel" htmlFor="wPhone">
              Phone <span>· optional</span>
            </label>
            <input
              id="wPhone"
              type="tel"
              className="editinput"
              value={pPhone}
              maxLength={40}
              placeholder="+1 555 123 4567"
              onChange={(e) => setPPhone(e.target.value)}
            />
            <label className="flabel" htmlFor="wWhatsapp">
              WhatsApp <span>· optional</span>
            </label>
            <input
              id="wWhatsapp"
              type="tel"
              className="editinput"
              value={pWhatsapp}
              maxLength={40}
              placeholder="+1 555 123 4567"
              onChange={(e) => setPWhatsapp(e.target.value)}
            />
            </>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <h1>Where do you coach?</h1>
            <p>Pick the studios and spaces you work at. Can&rsquo;t find one? Add it.</p>
            <div className="searchbox">
              <span className="mag"><Icon name="search" size={17} /></span>
              <input
                type="text"
                placeholder="Search studios by name or street"
                autoComplete="off"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="wizstudios">
              {filtered.map((s) => {
                const on = selected.has(s.id);
                return (
                  <button
                    key={s.id}
                    className={`wizstudio${on ? " on" : ""}`}
                    onClick={() => toggleStudio(s.id)}
                  >
                    <span className="wizstudio-txt">
                      <span className="nm">{s.name}</span>
                      <span className="ad">{s.address}</span>
                    </span>
                    <span className="wizstudio-tick" aria-hidden="true">
                      {on && <Icon name="check" size={18} />}
                    </span>
                  </button>
                );
              })}
              {!filtered.length && !adding && (
                <p className="wizempty">
                  {studios.length ? "No match." : "No studios yet."} Add the one you coach at below.
                </p>
              )}
            </div>

            {adding ? (
              <div className="wizadd">
                <input
                  className="editinput"
                  placeholder="Studio name"
                  autoFocus
                  value={nsName}
                  maxLength={80}
                  onChange={(e) => setNsName(e.target.value)}
                />
                <input
                  className="editinput"
                  style={{ marginTop: 8 }}
                  placeholder="Address"
                  value={nsAddr}
                  maxLength={160}
                  onChange={(e) => setNsAddr(e.target.value)}
                />
                <div className="wizadd-row">
                  <button
                    className="btn si"
                    disabled={pending || !nsName.trim() || !nsAddr.trim()}
                    onClick={addStudio}
                  >
                    {pending ? "Adding…" : "Add studio"}
                  </button>
                  <button
                    className="linktoggle"
                    onClick={() => {
                      setAdding(false);
                      setNsName("");
                      setNsAddr("");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button className="wizaddnew" onClick={() => setAdding(true)}>
                + Add a studio
              </button>
            )}
          </>
        )}

        {error && <div className="errorcopy" style={{ textAlign: "left" }}>{error}</div>}

        <div className="wiznav">
          {step > 1 && (
            <button className="btn ghost wizback" onClick={() => setStep(step - 1)} disabled={pending}>
              Back
            </button>
          )}
          <button className="btn si" onClick={next} disabled={pending}>
            {pending ? "One sec…" : step < TOTAL ? "Continue" : "Finish setup"}
          </button>
        </div>
      </div>
    </section>
  );
}

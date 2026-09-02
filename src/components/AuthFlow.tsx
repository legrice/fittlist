"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import {
  beginPasskeyLogin,
  beginPasskeyRegistration,
  claimProfile,
  finishPasskeyLogin,
  finishPasskeyRegistration,
  passwordAuth,
  requestMagicLink,
} from "@/app/actions/auth";
import { requestInvite } from "@/app/actions/invites";
import { rememberAfterAuth, takeAfterAuth } from "@/lib/afterauth";
import { slug } from "@/lib/format";
import { Icon } from "@/components/Icon";
import { Wordmark } from "@/components/Wordmark";
import Link from "next/link";
import { hasLocalPasskeyHistory, rememberLocalPasskey } from "@/lib/passkey-device";

type Stage = "landing" | "sent" | "claim";
type SheetMode = "signup" | "login";
type LandingCalendar = "All" | "You" | "Maya" | "Theo" | "Lena";

const landingCalendars = [
  ["All", "calendar_month", "neutral"],
  ["You", "Y", "rose"],
  ["Maya", "M", "blue"],
  ["Theo", "T", "gold"],
  ["Lena", "L", "mint"],
] as const satisfies ReadonlyArray<readonly [LandingCalendar, string, string]>;

const landingClasses = [
  ["Today", "Maya Ortiz", "Morning Flow", "Northline Yoga", "7:00am", "M", "blue", "Maya"],
  ["Today", "Theo Brooks", "Strength Lab", "Iron House", "5:30pm", "T", "gold", "Theo"],
  ["Today", "You", "Waterfront Run", "Pier Track", "6:00pm", "Y", "rose", "You"],
  ["Tue, Sep 3", "Lena Park", "Mat Pilates", "Studio Arc", "8:00am", "L", "mint", "Lena"],
  ["Tue, Sep 3", "Maya Ortiz", "Lunch Flow", "Harbor Room", "12:00pm", "M", "blue", "Maya"],
  ["Wed, Sep 4", "Maya Ortiz", "Reformer Basics", "Studio Arc", "9:00am", "M", "blue", "Maya"],
  ["Wed, Sep 4", "Theo Brooks", "Kettlebell Basics", "The Foundry", "5:00pm", "T", "gold", "Theo"],
  ["Wed, Sep 4", "You", "Mobility Reset", "Northline Yoga", "6:30pm", "Y", "rose", "You"],
  ["Thu, Sep 5", "Theo Brooks", "Conditioning", "The Fieldhouse", "6:00pm", "T", "gold", "Theo"],
  ["Thu, Sep 5", "Lena Park", "Sculpt", "House of Movement", "7:00pm", "L", "mint", "Lena"],
  ["Thu, Sep 5", "You", "Strength Circuit", "Iron House", "7:30pm", "Y", "rose", "You"],
  ["Fri, Sep 6", "Maya Ortiz", "Evening Yoga", "Harbor Room", "5:30pm", "M", "blue", "Maya"],
  ["Fri, Sep 6", "Lena Park", "Power Pilates", "Studio Arc", "6:30pm", "L", "mint", "Lena"],
  ["Sat, Sep 7", "Theo Brooks", "Open Gym", "The Foundry", "11:00am", "T", "gold", "Theo"],
  ["Sat, Sep 7", "You", "Weekend Miles", "Riverside Park", "9:00am", "Y", "rose", "You"],
  ["Sat, Sep 7", "Maya Ortiz", "Slow Flow", "Northline Yoga", "4:00pm", "M", "blue", "Maya"],
  ["Sat, Sep 7", "Lena Park", "Core Lab", "House of Movement", "5:00pm", "L", "mint", "Lena"],
  ["Sun, Sep 8", "Lena Park", "Recovery Flow", "Northline Yoga", "10:00am", "L", "mint", "Lena"],
  ["Sun, Sep 8", "Theo Brooks", "Barbell Club", "Iron House", "12:00pm", "T", "gold", "Theo"],
  ["Sun, Sep 8", "You", "Restorative Yoga", "Harbor Room", "5:00pm", "Y", "rose", "You"],
  ["Mon, Sep 9", "Maya Ortiz", "Sunrise Flow", "Northline Yoga", "7:00am", "M", "blue", "Maya"],
  ["Mon, Sep 9", "Theo Brooks", "Strength Lab", "The Foundry", "5:30pm", "T", "gold", "Theo"],
  ["Mon, Sep 9", "You", "Evening Run", "Pier Track", "6:00pm", "Y", "rose", "You"],
  ["Mon, Sep 9", "Lena Park", "Mat Pilates", "Studio Arc", "7:00pm", "L", "mint", "Lena"],
  ["Tue, Sep 10", "Maya Ortiz", "Power Vinyasa", "Harbor Room", "8:00am", "M", "blue", "Maya"],
  ["Tue, Sep 10", "Theo Brooks", "Kettlebell Club", "Iron House", "6:00pm", "T", "gold", "Theo"],
  ["Tue, Sep 10", "You", "Reformer Basics", "Studio Arc", "6:30pm", "Y", "rose", "You"],
  ["Tue, Sep 10", "Lena Park", "Mobility Flow", "Northline Yoga", "7:30pm", "L", "mint", "Lena"],
  ["Wed, Sep 11", "Maya Ortiz", "Candlelight Yoga", "House of Movement", "6:00pm", "M", "blue", "Maya"],
  ["Wed, Sep 11", "Theo Brooks", "Athletic Conditioning", "The Fieldhouse", "6:30pm", "T", "gold", "Theo"],
  ["Wed, Sep 11", "You", "Open Gym", "The Foundry", "7:00pm", "Y", "rose", "You"],
  ["Wed, Sep 11", "Lena Park", "Pilates Sculpt", "Harbor Room", "7:30pm", "L", "mint", "Lena"],
] as const;

function PhoneStatusIcons() {
  return (
    <span className="obwelcome-status-icons" aria-hidden="true">
      <svg className="obwelcome-iphone-cellular" viewBox="0 0 18 12">
        <rect x="0" y="8" width="3" height="4" rx="1" />
        <rect x="5" y="6" width="3" height="6" rx="1" />
        <rect x="10" y="3" width="3" height="9" rx="1" />
        <rect x="15" y="0" width="3" height="12" rx="1" />
      </svg>
      <svg className="obwelcome-iphone-wifi" viewBox="0 0 17 12">
        <path d="M1 3.7C5.35-.15 11.65-.15 16 3.7L14.45 5.4C11 2.42 6 2.42 2.55 5.4L1 3.7Z" />
        <path d="M4 7C6.58 4.76 10.42 4.76 13 7L11.45 8.7C9.75 7.28 7.25 7.28 5.55 8.7L4 7Z" />
        <circle cx="8.5" cy="10.7" r="1.3" />
      </svg>
      <svg className="obwelcome-iphone-battery" viewBox="0 0 25 12">
        <rect className="obwelcome-iphone-battery-case" x=".75" y=".75" width="20.5" height="10.5" rx="3" />
        <rect x="2.5" y="2.5" width="17" height="7" rx="1.6" />
        <path d="M22.3 4V8C23.55 7.58 24.25 6.88 24.25 6S23.55 4.42 22.3 4Z" />
      </svg>
    </span>
  );
}

function LandingCalendarMockup() {
  const [calendar, setCalendar] = useState<LandingCalendar>("All");
  const visibleClasses = calendar === "All"
    ? landingClasses
    : landingClasses.filter((entry) => entry[7] === calendar);
  let priorDay = "";
  return (
    <div className="obwelcome-phone" aria-label="Interactive sample FittList calendar">
      <div className="obwelcome-status"><b>9:41</b><PhoneStatusIcons /></div>
      <div className="obwelcome-phone-head"><h2>Calendar</h2><span><Icon name="notifications" size={18} /></span></div>
      <div className="obwelcome-calendars">
        {landingCalendars.map(([name, mark, tone]) => (
          <button type="button" className={calendar === name ? "on" : ""} aria-pressed={calendar === name} onClick={() => setCalendar(name)} key={name}>
            <span data-tone={tone}>{mark === "calendar_month" ? <Icon name={mark} size={20} /> : mark}</span>
            <small>{name}</small>
          </button>
        ))}
      </div>
      <div className="obwelcome-schedule" key={calendar} aria-live="polite">
        {visibleClasses.map(([day, person, name, studio, time, initial, tone]) => {
          const heading = day !== priorDay;
          priorDay = day;
          return (
            <div className="obwelcome-class-wrap" key={`${day}-${name}`}>
              {heading && <h3>{day}</h3>}
              <div className="obwelcome-class">
                <i data-tone={tone}>{initial}</i>
                <span><small>{person}</small><strong>{name}</strong><em>{studio}</em></span>
                <time>{time}</time>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LandingShareMockup() {
  return (
    <div className="obwelcome-phone obwelcome-share-phone" role="img" aria-label="A sample FittList share editor">
      <div className="obwelcome-status"><b>9:41</b><PhoneStatusIcons /></div>
      <div className="obwelcome-share-canvas">
        <div className="obwelcome-share-accent" />
        <h2>Move<br />with me.</h2>
        <div className="obwelcome-share-day">
          <strong>MON</strong>
          <span><i><b>Morning Flow</b><em>Northline Yoga</em></i><small>7:00 AM</small></span>
          <span><i><b>Strength Class</b><em>Iron House</em></i><small>5:30 PM</small></span>
        </div>
        <div className="obwelcome-share-day">
          <strong>WED</strong>
          <span><i><b>Run Club</b><em>Pier Track</em></i><small>6:00 PM</small></span>
        </div>
        <div className="obwelcome-share-day">
          <strong>FRI</strong>
          <span><i><b>Power Pilates</b><em>Studio Arc</em></i><small>8:30 AM</small></span>
          <span><i><b>Open Gym</b><em>The Foundry</em></i><small>4:00 PM</small></span>
        </div>
        <div className="obwelcome-share-day">
          <strong>SAT</strong>
          <span><i><b>Weekend Miles</b><em>Riverside Park</em></i><small>9:00 AM</small></span>
        </div>
        <div className="obwelcome-share-signoff"><small>See my week at</small><b>fittlist.co/yourname</b></div>
      </div>
      <div className="obwelcome-share-controls" aria-hidden="true">
        {[["auto_awesome", "Random"], ["palette", "Color"], ["image", "Photo"], ["tune", "Style"], ["list", "Classes"]].map(([icon, label]) => (
          <span key={label}><i><Icon name={icon} size={18} /></i><b>{label}</b></span>
        ))}
        <strong>Share</strong>
      </div>
    </div>
  );
}

function LandingGroupMockup() {
  return (
    <div className="obwelcome-phone obwelcome-feature-phone" role="img" aria-label="A sample FittList group calendar">
      <div className="obwelcome-status"><b>9:41</b><PhoneStatusIcons /></div>
      <div className="obwelcome-feature-head"><span data-tone="mint">S</span><div><small>GROUP</small><h2>Striders Run Club</h2></div></div>
      <div className="obwelcome-member-row" aria-hidden="true">
        {[["A", "rose"], ["M", "blue"], ["T", "gold"], ["L", "mint"]].map(([initial,tone]) => <i data-tone={tone} key={initial}>{initial}</i>)}
        <b>24 members</b>
      </div>
      <div className="obwelcome-feature-actions"><b>Following</b><span>Invite</span><span>Share</span></div>
      <div className="obwelcome-feature-section"><h3>Coming up</h3>
        <article><i data-tone="mint">S</i><span><strong>Wednesday Miles</strong><small>Riverside Park · 6:30 PM</small></span></article>
        <article><i data-tone="rose">Y</i><span><strong>Saturday Long Run</strong><small>Pier Track · 9:00 AM</small></span></article>
        <article><i data-tone="blue">M</i><span><strong>Post-run Mobility</strong><small>Northline Yoga · 10:30 AM</small></span></article>
      </div>
      <div className="obwelcome-feature-note"><Icon name="chat" size={19} /><span><strong>Keep everyone together</strong><small>Plans, updates, and the full group schedule in one place.</small></span></div>
    </div>
  );
}

function LandingStudioMockup() {
  return (
    <div className="obwelcome-phone obwelcome-feature-phone" role="img" aria-label="A sample FittList studio calendar">
      <div className="obwelcome-status"><b>9:41</b><PhoneStatusIcons /></div>
      <div className="obwelcome-feature-head"><span data-tone="gold">N</span><div><small>STUDIO</small><h2>Northline Yoga</h2></div></div>
      <div className="obwelcome-studio-stats"><span><b>18</b><small>Classes</small></span><span><b>6</b><small>Coaches</small></span><span><b>142</b><small>Followers</small></span></div>
      <div className="obwelcome-feature-actions"><b>Manage</b><span>Preview</span><span>Share</span></div>
      <div className="obwelcome-feature-section"><h3>Today</h3>
        <article><i data-tone="blue">M</i><span><strong>Morning Flow</strong><small>Maya Ortiz · 7:00 AM</small></span></article>
        <article><i data-tone="mint">L</i><span><strong>Power Pilates</strong><small>Lena Park · 12:00 PM</small></span></article>
        <article><i data-tone="gold">T</i><span><strong>Strength Lab</strong><small>Theo Brooks · 5:30 PM</small></span></article>
      </div>
      <div className="obwelcome-feature-note"><Icon name="groups" size={20} /><span><strong>Your coaches spread the word</strong><small>Every schedule links back to the studio calendar.</small></span></div>
    </div>
  );
}

export function AuthFlow({
  startStage,
  via = null,
  inviteOnly = false,
  invited = false,
  invitedByLink = false,
  inviter = null,
  claimAs = "coach",
  fans = false,
  landing = "/feed",
}: {
  startStage: "email" | "claim";
  via?: string | null;
  inviteOnly?: boolean;
  /** They got here from a beta invite email, so they're already through the
   *  gate — say so, and don't ask them to queue for what they already have. */
  invited?: boolean;
  /** Through the gate on a share link rather than an emailed invite, so any
   *  email address works and the copy must not tell them otherwise. */
  invitedByLink?: boolean;
  /** They arrived on somebody's share link. Same thing as an invite as far as
   *  the gate is concerned, and worth naming: a link from a person you know is
   *  a better reason to sign up than a product page. */
  inviter?: { name: string; photo: string | null; color: string } | null;
  /** Which side an already-signed-in visitor is claiming for. The server knows
   *  it from users.kind; the client can't, on a fresh load. */
  claimAs?: "coach" | "fan";
  fans?: boolean;
  /** Where a finished sign-in lands. The server computes it (Home is
   *  dark-launched, so it is Following for everyone but an admin), because a
   *  client can't ask who is an admin. */
  landing?: string;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const [stage, setStage] = useState<Stage>(
    startStage === "claim" ? "claim" : "landing",
  );
  const [sheet, setSheet] = useState<SheetMode | null>(null);
  // Fan side (flag-gated): who's signing up — a coach or someone following one.
  const [role, setRole] = useState<"coach" | "fan">(claimAs);
  const [bio, setBio] = useState(false);
  // The "sent" screen doubles as password recovery; this picks the copy.
  const [resetMode, setResetMode] = useState(false);
  const [signupLink, setSignupLink] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [error, setError] = useState(
    search.get("invite")
      ? "That invitation needs a fresh link. You can also sign up directly below."
      : search.get("expired")
        ? "That link expired. Try again."
        : "",
  );
  const [pending, startTransition] = useTransition();
  const [passkeyable, setPasskeyable] = useState(false);
  const [knownPasskey, setKnownPasskey] = useState(false);
  const [passkeyLabel, setPasskeyLabel] = useState("Log in with a passkey");
  // "Request an invite" modal (invite-only beta).
  const [requestOpen, setRequestOpen] = useState(false);
  const [reqName, setReqName] = useState("");
  const [reqEmail, setReqEmail] = useState("");
  const [reqErr, setReqErr] = useState("");
  const [reqSent, setReqSent] = useState(false);
  const landingStoriesRef = useRef<HTMLDivElement>(null);
  const pendingProfile = useRef(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPasskeyable(typeof window !== "undefined" && !!window.PublicKeyCredential);
    setKnownPasskey(hasLocalPasskeyHistory());
    const appleMobile = /iPhone|iPad|iPod/i.test(navigator.userAgent)
      || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (appleMobile) setPasskeyLabel("Log in with Face ID");
  }, []);
  // Arriving from a coach's page with a door already chosen: "?join=login"
  // opens the sign-in sheet, "?join=signup" the sign-up one. Tapping Sign in on
  // a profile and landing on the marketing page would just be a second tap.
  useEffect(() => {
    const join = search.get("join");
    if (join === "login" || join === "signup") setSheet(join);
    // The page they left, kept for the far side of the flow. It goes into
    // storage now because the flow from here is a sheet, a passkey prompt and
    // sometimes a three-step wizard, and none of those carry a query string.
    rememberAfterAuth(search.get("next"));
    // Read once on arrival; changing the sheet afterwards is the user's job.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (stage === "claim") nameRef.current?.focus();
  }, [stage]);
  useEffect(() => {
    const stories = landingStoriesRef.current;
    if (!stories) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      if (window.innerWidth <= 900) {
        stories.removeAttribute("data-story");
        return;
      }
      const scrolled = -stories.getBoundingClientRect().top;
      const chapter = Math.max(0, Math.min(3, Math.floor(scrolled / window.innerHeight + .44)));
      stories.dataset.story = ["calendar", "share", "groups", "studio"][chapter];
    };
    const scheduleUpdate = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", scheduleUpdate, { passive:true });
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [stage]);
  const pendingFan = useRef(claimAs === "fan");
  // Everyone claims a name and a link, then lands on the same calendar.
  const proceed = (needsProfile: boolean, fan = false) => {
    pendingFan.current = fan;
    if (fan) setRole("fan");
    if (needsProfile) setStage("claim");
    // Somebody who tapped Follow on a coach's page came here to do that, not
    // to read their own feed. The wizard consumes it instead when there's one
    // still to come, so this only reads it when the flow ends here.
    else router.push(takeAfterAuth() ?? landing);
  };

  // The same one-tap link, framed two ways. As "magic link" it's a way to skip
  // typing a password; as "forgot password" it's the recovery path — and for an
  // account that never set a password (invited by email, signed up with Google)
  // it's the only way back in. Landing from the link offers to set one.
  const sendLink = (reset = false, signup = false) => {
    if (!email.trim()) {
      setError("Enter your email first.");
      return;
    }
    setError("");
    startTransition(async () => {
      const res = await requestMagicLink(email, via, signup ? "signup" : reset ? "reset" : "login");
      if (res.ok) {
        setSheet(null);
        setResetMode(reset);
        setSignupLink(signup);
        setStage("sent");
      } else setError(res.error ?? "Something went wrong.");
    });
  };

  const submitAuth = () => {
    if (sheet === "signup") {
      sendLink(false, true);
      return;
    }
    if (!email.trim() || !password) return;
    setError("");
    startTransition(async () => {
      const res = await passwordAuth(email, password, false);
      if (!res.ok) {
        setError(res.error ?? "Something went wrong.");
        return;
      }
      setSheet(null);
      pendingProfile.current = !!res.needsProfile;
      pendingFan.current = !!res.fan;
      if (passkeyable && !res.hasPasskey && (res.needsProfile || !res.fan)) setBio(true);
      else proceed(!!res.needsProfile, !!res.fan);
    });
  };

  const enrollBiometric = () => {
    startTransition(async () => {
      try {
        const res = await beginPasskeyRegistration();
        if (res.ok) {
          const reg = await startRegistration({ optionsJSON: res.options });
          const finish = await finishPasskeyRegistration(reg, "Passkey");
          if (finish.ok) {
            rememberLocalPasskey();
            setKnownPasskey(true);
          }
        }
      } catch {
        /* user cancelled or it failed — either way, continue */
      }
      setBio(false);
      proceed(pendingProfile.current, pendingFan.current);
    });
  };

  const usePasskeyLogin = () => {
    setError("");
    startTransition(async () => {
      try {
        const { options } = await beginPasskeyLogin();
        const response = await startAuthentication({ optionsJSON: options });
        const res = await finishPasskeyLogin(response);
        if (res.ok) {
          rememberLocalPasskey();
          setKnownPasskey(true);
          proceed(!!res.needsProfile, !!res.fan);
        }
        else setError(res.error ?? "That didn't work.");
      } catch (err) {
        const nm = (err as Error)?.name;
        if (nm !== "AbortError" && nm !== "NotAllowedError") setError("Couldn't use a passkey.");
      }
    });
  };

  const openRequest = () => {
    setReqErr("");
    setReqSent(false);
    setReqName((n) => n || name);
    setReqEmail((e) => e || email);
    setSheet(null);
    setRequestOpen(true);
  };

  const submitRequest = () => {
    if (!reqEmail.trim()) {
      setReqErr("Enter your email.");
      return;
    }
    setReqErr("");
    startTransition(async () => {
      const res = await requestInvite(reqName, reqEmail);
      if (res.ok) setReqSent(true);
      else setReqErr(res.error ?? "Something went wrong.");
    });
  };

  const claim = () => {
    if (!name.trim()) return;
    setError("");
    startTransition(async () => {
      const asFan = fans && (role === "fan" || pendingFan.current);
      const res = await claimProfile(name, handle, via, asFan ? "fan" : "coach");
      if (res.ok) router.push("/welcome");
      else setError(res.error ?? "Something went wrong.");
    });
  };

  const urlPreview = slug(handle.trim() || name) || "yourname";
  // Which side the claim step is serving. `role` covers the signup sheet; the
  // ref covers arriving here from a login or a magic link, where the sheet was
  // never opened.
  const claimingAsFan = fans && (role === "fan" || pendingFan.current);

  return (
    <section className="screen ob">
      <div className="pad">
        <Wordmark variant="ink" className="mark" />

        {stage === "landing" && (
          <div className="obwelcome">
            <header className="obwelcome-head">
              <Wordmark variant="ink" className="obwelcome-logo" />
              <nav aria-label="Account">
                <button type="button" className="obwelcome-signup-button" onClick={() => { setError(""); setSheet("signup"); }}>
                  Sign up
                </button>
                <button type="button" className="obwelcome-login-button" onClick={() => { setError(""); setSheet("login"); }}>
                  Log in
                </button>
              </nav>
            </header>
            <div className="obwelcome-stories" data-story="calendar" ref={landingStoriesRef}>
              <div className="obwelcome-story-stage">
                <div className="obwelcome-grid obwelcome-calendar-grid">
                <div className="obwelcome-title">
                  <h1>Fit all your fitness into one calendar.</h1>
                </div>
                <div className="obwelcome-device"><LandingCalendarMockup /></div>
                <div className="obwelcome-copy">
                  <p>Manage your schedule across multiple studios and see what your friends and favorite coaches are up to.</p>
                  <form className="obwelcome-email" onSubmit={(event) => { event.preventDefault(); sendLink(false, true); }}>
                    <span><Icon name="mail" size={18} /></span>
                    <input
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      aria-label="Email address"
                      placeholder="Email address"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                    />
                    <button type="submit" disabled={pending}>
                      {pending ? "Sending…" : "Get started"} <Icon name="arrow_forward" size={18} />
                    </button>
                  </form>
                  {error && <div className="errorcopy">{error}</div>}
                </div>
                </div>
                <div className="obwelcome-grid obwelcome-share-grid">
                  <div className="obwelcome-title">
                    <h1>Share your week your way.</h1>
                  </div>
                  <div className="obwelcome-device"><LandingShareMockup /></div>
                  <div className="obwelcome-copy">
                    <p>Send your classes as an image, share a link, or post them anywhere you&rsquo;d like.</p>
                  </div>
                </div>
                <div className="obwelcome-grid obwelcome-groups-grid">
                  <div className="obwelcome-title">
                    <h1>Organize groups and keep everyone on the same page.</h1>
                  </div>
                  <div className="obwelcome-device"><LandingGroupMockup /></div>
                  <div className="obwelcome-copy">
                    <p>Bring the schedule, updates, and everyone who&rsquo;s joining together in one shared calendar.</p>
                  </div>
                </div>
                <div className="obwelcome-grid obwelcome-studio-grid">
                  <div className="obwelcome-title">
                    <h1>Manage your studio&rsquo;s calendar.</h1>
                  </div>
                  <div className="obwelcome-device"><LandingStudioMockup /></div>
                  <div className="obwelcome-copy">
                    <p>Your coaches become a marketing network, sharing classes and sending people back to your studio.</p>
                  </div>
                </div>
              </div>
            </div>
            <footer className="obwelcome-footer">
              <Wordmark variant="ink" className="obwelcome-footer-mark" />
              <span>&copy; {new Date().getFullYear()} FittList</span>
              <a href="mailto:hello@fittlist.co">Contact</a>
              <button type="button" onClick={() => { setError(""); setSheet("signup"); }}>
                Sign up
              </button>
            </footer>
          </div>
        )}

        {stage === "sent" && (
          <>
            <h1>Check your inbox.</h1>
            <p>
              {signupLink ? (
                <>
                  We emailed a verification link to <b>{email}</b>. Open it on this device to
                  create your account and continue setup. It expires in 15 minutes.
                </>
              ) : resetMode ? (
                <>
                  We emailed a sign-in link to <b>{email}</b>. Open it on this device and
                  you&rsquo;ll be signed straight in. Then you can set a new password so you
                  don&rsquo;t need the email next time. It expires in 15 minutes.
                </>
              ) : (
                <>
                  We emailed a one-tap sign-in link to <b>{email}</b>. Open it on this device and
                  you&rsquo;re in. It expires in 15 minutes.
                </>
              )}
            </p>
            <button className="btn ghost" onClick={() => setStage("landing")}>
              Back
            </button>
            {error && <div className="errorcopy">{error}</div>}
            <div className="microcopy">The link works once. Request a new one any time.</div>
          </>
        )}


        {stage === "claim" && (
          <>
            <h1>Pick your link.</h1>
            <p>
              {claimingAsFan
                ? "Your profile lives here. It's how coaches and other members find you, and it's yours to share."
                : "This is the one link you share everywhere: your bio, your DMs, your business card. Anyone who opens it sees your schedule and how to reach you."}
            </p>
            <input
              ref={nameRef}
              placeholder="Your name"
              autoComplete="name"
              maxLength={40}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div className="urlfield">
              <span className="urlfield-pre">fittlist.co/</span>
              <input
                className="urlfield-in"
                placeholder={slug(name) || "yourname"}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                maxLength={30}
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && claim()}
              />
            </div>
            <div className="handlepreview">
              {claimingAsFan ? "Your profile will live at " : "Your page will live at "}
              <b>fittlist.co/{urlPreview}</b>
            </div>
            <button className="btn" onClick={claim} disabled={pending}>
              {pending ? "Claiming…" : "Claim it"}
            </button>
            {error && <div className="errorcopy">{error}</div>}
          </>
        )}
      </div>

      {/* email + password bottom sheet (sign up or sign in) */}
      {sheet && (
        <div className="sheet-scrim" onClick={(e) => { if (e.target === e.currentTarget) setSheet(null); }}>
          <div className="sheet">
            <button className="iconbtn sheetclose" aria-label="Close" onClick={() => setSheet(null)}>
              <Icon name="close" size={18} />
            </button>
            <h2>
              {sheet === "signup"
                ? invited || inviter
                  ? "Claim your invite"
                  : "Sign up with email"
                : "Log in"}
            </h2>
            {/* Two sentences, built rather than picked: what this role gets,
                then how to get in. The old chain let the beta gate swallow the
                role copy, so someone who tapped "I'm here to train" was never
                told what following would do for them. */}
            <p className="lead">
              {sheet === "signup"
                ? invited
                  ? // Two sentences already, and the landing they came from
                    // said which side they're on. Adding the role line here
                    // would push it to three.
                    invitedByLink
                    ? "Any email works. We'll send a secure link to verify it."
                    : "Use the email your invite was sent to. We'll send a secure link to verify it."
                  : [
                      fans
                        ? "One account, whether you coach or you're here to train."
                        : null,
                      inviteOnly && !inviter
                        ? "Invite-only beta: use your invited email."
                        : "We'll email a secure sign-up link.",
                    ]
                      .filter(Boolean)
                      .join(" ")
                : "Welcome back. Enter your email and password."}
            </p>
            <input
              type="email"
              className="editinput"
              placeholder="you@example.com"
              autoComplete="email"
              autoCapitalize="none"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {sheet === "login" && (
              <input
                type="password"
                className="editinput"
                style={{ marginTop: 10 }}
                placeholder="Password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitAuth()}
              />
            )}
            {/* Recovery, said in the words people look for, and sitting where
                the problem is — right under the field they can't fill in. */}
            {sheet === "login" && (
              <button className="authforgot" onClick={() => sendLink(true)} disabled={pending}>
                Forgot your password?
              </button>
            )}
            {/* The other ways in, both as buttons: they're alternatives to the
                password, not footnotes about it. */}
            {sheet === "login" && <div className="obalts" style={{ marginTop: 14 }}>
              <button className="obalt" onClick={() => sendLink(false)} disabled={pending}>
                <Icon name="auto_awesome" size={21} /> Email me a magic link
              </button>
              {sheet === "login" && passkeyable && knownPasskey && (
                <button className="obalt" onClick={usePasskeyLogin} disabled={pending}>
                  <Icon name="fingerprint" size={21} /> {passkeyLabel}
                </button>
              )}
            </div>}
            {error && <div className="errorcopy" style={{ textAlign: "left" }}>{error}</div>}
            {inviteOnly && !invited && !inviter && sheet === "signup" && (
              <button className="authmagic" onClick={openRequest}>
                Not invited yet? Request an invite
              </button>
            )}
            <div className="publishwrap nostick">
              <button className="btn si" onClick={submitAuth} disabled={pending || !email.trim()}>
                {pending ? "One sec…" : sheet === "signup" ? "Email sign-up link" : "Sign in"}
              </button>
            </div>
            {sheet === "signup" && (
              <p className="authsignup-legal">
                By creating an account, you agree to FittList&rsquo;s <Link href="/terms">Terms of Use</Link> and acknowledge our <Link href="/privacy">Privacy Policy</Link>.
              </p>
            )}
            {/* The other door, under the button. Someone who opened Sign in from
                a coach's page and has never been here before had nothing to tap
                but the close button: the way to sign up was back where they
                came from. Each sheet names the one it isn't. */}
            <button
              className="obloginlink authswitch"
              onClick={() => {
                setError("");
                setSheet(sheet === "signup" ? "login" : "signup");
              }}
            >
              {sheet === "signup" ? (
                <>
                  Already have an account? <b>Sign in</b>
                </>
              ) : (
                <>
                  Don&rsquo;t have an account? <b>Sign up</b>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* biometric enrollment prompt after a password sign-in */}
      {bio && (
        <div className="sheet-scrim" onClick={(e) => { if (e.target === e.currentTarget) { setBio(false); proceed(pendingProfile.current, pendingFan.current); } }}>
          <div className="sheet">
            <div className="bioicon"><Icon name="fingerprint" size={30} /></div>
            <h2>Sign in faster next time?</h2>
            <p className="lead">
              Add Face ID, Touch ID, or your fingerprint and skip the password next time you sign in.
            </p>
            <div className="publishwrap">
              <button className="btn si" onClick={enrollBiometric} disabled={pending}>
                {pending ? "…" : "Use biometrics"}
              </button>
              <button
                className="btn ghost"
                style={{ marginTop: 8 }}
                disabled={pending}
                onClick={() => { setBio(false); proceed(pendingProfile.current, pendingFan.current); }}
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* request-an-invite bottom sheet (invite-only beta) */}
      {requestOpen && (
        <div className="sheet-scrim" onClick={(e) => { if (e.target === e.currentTarget) setRequestOpen(false); }}>
          <div className="sheet">
            <button className="iconbtn sheetclose" aria-label="Close" onClick={() => setRequestOpen(false)}>
              <Icon name="close" size={18} />
            </button>
            {reqSent ? (
              <>
                <h2>You&rsquo;re on the list.</h2>
                <p className="lead">
                  Thanks{reqName.trim() ? `, ${reqName.trim().split(" ")[0]}` : ""}. We&rsquo;ll email
                  <b> {reqEmail.trim()}</b> an invite when a spot opens.
                </p>
                <div className="publishwrap nostick">
                  <button className="btn si" onClick={() => setRequestOpen(false)}>Done</button>
                </div>
              </>
            ) : (
              <>
                <h2>Request an invite</h2>
                <p className="lead">
                  Fittlist is invite-only during beta. Tell us who you are and we&rsquo;ll send an
                  invite when a spot opens.
                </p>
                <input
                  className="editinput"
                  placeholder="Your name"
                  autoComplete="name"
                  maxLength={80}
                  value={reqName}
                  onChange={(e) => setReqName(e.target.value)}
                />
                <input
                  type="email"
                  className="editinput"
                  style={{ marginTop: 10 }}
                  placeholder="you@example.com"
                  autoComplete="email"
                  autoCapitalize="none"
                  value={reqEmail}
                  onChange={(e) => setReqEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitRequest()}
                />
                {reqErr && <div className="errorcopy" style={{ textAlign: "left" }}>{reqErr}</div>}
                <div className="publishwrap nostick">
                  <button className="btn si" onClick={submitRequest} disabled={pending}>
                    {pending ? "Sending…" : "Request an invite"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

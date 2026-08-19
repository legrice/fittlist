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

const landingSlides = [
  {
    title: "Your whole week, in one place.",
    art: "calendar",
  },
  {
    title: "Share it. Post it. Send it to your mom.",
    art: "share",
  },
  {
    title: "Follow your favorites. Respectfully.",
    art: "favorites",
  },
  {
    title: "Keep everyone on the same schedule.",
    art: "groups",
  },
] as const;

const OnboardingCalendarArt = () => (
  <div className="obcalendar-art" role="img" aria-label="Three classes arranged on a FittList calendar">
    {([
      ["6:30 AM", "Morning yoga", "Yoga studio", "Your coach", "C", "Saved", "saved"],
      ["5:00 PM", "Kettlebell strength", "Strength studio", "You", "Y", "Coaching", "coaching"],
      ["6:00 PM", "Run club", "Outdoor space", "A friend", "F", "Going", "going"],
    ] as const).map(([time, name, studio, person, initials, tag, tone], index) => (
      <div className={`obcalendar-card obcalendar-card-${index + 1}`} key={name}>
        <div className="obcalendar-card-top"><span>{time}</span><span className={`obcalendar-tag ${tone}`}>{tag}</span></div>
        <strong>{name}</strong>
        <small>{studio}</small>
        <div className="obcalendar-person"><span className={`obcalendar-avatar avatar-${index + 1}`}>{initials}</span><span>{person}</span></div>
      </div>
    ))}
  </div>
);

const OnboardingShareArt = () => (
  <div className="obfeature-art obshare-art" role="img" aria-label="A FittList week ready to share by link or image">
    <div className="obshare-card obart-float float-a">
      <div className="obshare-accent" />
      <div className="obshare-headline"><span>Train</span><span>with me.</span></div>
      <div className="obshare-head">This week</div>
      <div className="obshare-day"><b>MON</b><span><strong>Morning yoga</strong><small>6:30 AM</small></span></div>
      <div className="obshare-day"><b>WED</b><span><strong>Kettlebell strength</strong><small>5:00 PM</small></span></div>
      <div className="obshare-day"><b>SAT</b><span><strong>Run club</strong><small>9:00 AM</small></span></div>
    </div>
  </div>
);

const OnboardingFavoritesArt = () => (
  <div className="obfeature-art obfavorites-art" role="img" aria-label="Favorite people and their active calendars">
    <div className="obfavorites-rail">
      {([['Y','You',''],['C','Coach','Coach'],['F','Friend','']] as const).map(([initials,name,tag],index)=><div className={`obfavorite-person obart-float float-${index===1?'c':'a'}`} key={name}><span className={`obfavorite-face face-${index+1}`}>{initials}</span><strong>{name}</strong>{tag&&<small>{tag}</small>}</div>)}
    </div>
    <div className="obfavorite-class obart-float float-b"><span><b>6:00 PM</b><strong>HYROX</strong><small>Your favorite studio</small></span><Icon name="bookmark" size={20}/></div>
  </div>
);

const OnboardingGroupsArt = () => (
  <div className="obfeature-art obgroups-art" role="img" aria-label="A FittList group planning classes together">
    <div className="obgroup-profile obart-float float-a">
      <div className="obgroup-cover"><span>RC</span></div>
      <strong>Neighborhood Run Club</strong>
      <small>Weekly miles, together.</small>
      <div className="obgroup-tabs"><b>Upcoming</b><span>Updates</span><span>Members</span></div>
      <div className="obgroup-class"><span><b>Saturday · 9:00 AM</b><strong>Waterfront 5K</strong></span><span className="obgroup-members"><i>AL</i><i>MK</i><i>+8</i></span></div>
    </div>
  </div>
);

const OnboardingArt = ({ art }: { art: typeof landingSlides[number]["art"] }) => {
  if (art === "calendar") return <OnboardingCalendarArt />;
  if (art === "share") return <OnboardingShareArt />;
  if (art === "favorites") return <OnboardingFavoritesArt />;
  if (art === "groups") return <OnboardingGroupsArt />;
  return null;
};

const GoogleG = () => (
  <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.4 30.3 0 24 0 14.6 0 6.4 5.4 2.5 13.3l7.9 6.1C12.3 13.2 17.7 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.5 3-2.2 5.5-4.7 7.2l7.3 5.7C43.9 37.9 46.5 31.8 46.5 24.5z" />
    <path fill="#FBBC05" d="M10.4 28.6c-.5-1.5-.8-3-.8-4.6s.3-3.1.8-4.6l-7.9-6.1C.9 16.5 0 20.1 0 24s.9 7.5 2.5 10.7l7.9-6.1z" />
    <path fill="#34A853" d="M24 48c6.3 0 11.6-2.1 15.5-5.7l-7.3-5.7c-2 1.4-4.7 2.3-8.2 2.3-6.3 0-11.7-3.7-13.6-9.9l-7.9 6.1C6.4 42.6 14.6 48 24 48z" />
  </svg>
);

const AppleLogo = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17.05 12.04c-.03-2.4 1.96-3.55 2.05-3.61-1.12-1.64-2.86-1.86-3.48-1.89-1.48-.15-2.89.87-3.64.87-.75 0-1.91-.85-3.14-.83-1.62.02-3.11.94-3.94 2.39-1.68 2.91-.43 7.22 1.21 9.58.8 1.15 1.76 2.45 3.02 2.4 1.21-.05 1.67-.78 3.13-.78 1.46 0 1.87.78 3.14.76 1.3-.02 2.12-1.17 2.91-2.33.92-1.34 1.3-2.64 1.32-2.71-.03-.01-2.53-.97-2.56-3.85zM14.63 4.84c.67-.81 1.12-1.94.99-3.06-.96.04-2.12.64-2.81 1.45-.62.72-1.16 1.87-1.02 2.97 1.07.08 2.17-.55 2.84-1.36z" />
  </svg>
);

export function AuthFlow({
  startStage,
  via = null,
  providers = { google: false, apple: false },
  inviteOnly = false,
  invited = false,
  invitedByLink = false,
  inviter = null,
  claimAs = "coach",
  fans = false,
  landing = "/calendar",
}: {
  startStage: "email" | "claim";
  via?: string | null;
  providers?: { google: boolean; apple: boolean };
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
  const [landingSlide, setLandingSlide] = useState(0);
  const [enteredSlides, setEnteredSlides] = useState<Set<number>>(() => new Set([0]));
  const landingTrackRef = useRef<HTMLDivElement>(null);
  // Fan side (flag-gated): who's signing up — a coach or someone following one.
  const [role, setRole] = useState<"coach" | "fan">(claimAs);
  const [bio, setBio] = useState(false);
  // The "sent" screen doubles as password recovery; this picks the copy.
  const [resetMode, setResetMode] = useState(false);
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
  const pendingProfile = useRef(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const viaQ = via ? `?via=${encodeURIComponent(via)}` : "";

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
    setEnteredSlides((current) => {
      if (current.has(landingSlide)) return current;
      const next = new Set(current);
      next.add(landingSlide);
      return next;
    });
  }, [landingSlide]);

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

  const submitPassword = () => {
    if (!email.trim() || !password) return;
    setError("");
    startTransition(async () => {
      // Everyone signs up as a member: "do you teach" is the wizard's
      // first page now, and setTeaching flips the account there.
      const res = await passwordAuth(email, password, fans && sheet === "signup");
      if (!res.ok) {
        setError(res.error ?? "Something went wrong.");
        return;
      }
      setSheet(null);
      pendingProfile.current = !!res.needsProfile;
      pendingFan.current = !!res.fan;
      // Offer to add a passkey right after signing in with a password. A fan
      // with a profile still to claim stays on "/", so the prompt has somewhere
      // to live; one who's already set up would be redirected out from under it.
      if (passkeyable && !res.hasPasskey && (res.needsProfile || !res.fan)) setBio(true);
      else proceed(!!res.needsProfile, !!res.fan);
    });
  };

  // The same one-tap link, framed two ways. As "magic link" it's a way to skip
  // typing a password; as "forgot password" it's the recovery path — and for an
  // account that never set a password (invited by email, signed up with Google)
  // it's the only way back in. Landing from the link offers to set one.
  const sendLink = (reset = false) => {
    if (!email.trim()) {
      setError("Enter your email first.");
      return;
    }
    setError("");
    startTransition(async () => {
      const res = await requestMagicLink(email, via);
      if (res.ok) {
        setSheet(null);
        setResetMode(reset);
        setStage("sent");
      } else setError(res.error ?? "Something went wrong.");
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
          <>
            <div className="oblanding-mark" aria-hidden="true">
              <span className="oblanding-progress-track">
                <span style={{ width: `${((landingSlide + 1) / landingSlides.length) * 100}%` }} />
              </span>
            </div>
            <div
              ref={landingTrackRef}
              className="oblanding-track"
              onScroll={(event) => {
                const track = event.currentTarget;
                if (!track.clientWidth) return;
                setLandingSlide(Math.max(0, Math.min(landingSlides.length - 1, Math.round(track.scrollLeft / track.clientWidth))));
              }}
            >
              {landingSlides.map((slide, index) => (
                <article className={`oblanding-slide${enteredSlides.has(index) ? " has-entered" : ""}`} key={slide.title}>
                  <div className="oblanding-shot has-art">
                    <OnboardingArt art={slide.art} />
                  </div>
                  <h1>{slide.title}</h1>
                </article>
              ))}
            </div>
            <div className="oblanding-footer">
              <div className="oblanding-actions">
                <button className="btn obsignup" onClick={() => { setError(""); setSheet("signup"); }}>
                  Sign up
                </button>
                <button className="btn oblogin" onClick={() => { setError(""); setSheet("login"); }}>
                  Log in
                </button>
              </div>
              {(providers.google || providers.apple) && (
                <div className="obalts" style={{ marginTop: 16 }}>
                  {providers.google && (
                    <a className="obalt google" href={`/api/google/login${viaQ}`}>
                      <GoogleG /> Continue with Google
                    </a>
                  )}
                  {providers.apple && (
                    <a className="obalt apple" href={`/api/apple/login${viaQ}`}>
                      <AppleLogo /> Continue with Apple
                    </a>
                  )}
                </div>
              )}
              {error && <div className="errorcopy">{error}</div>}
            </div>
          </>
        )}

        {stage === "sent" && (
          <>
            <h1>Check your inbox.</h1>
            <p>
              {resetMode ? (
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
                    ? "Any email works. Pick a password you'll remember."
                    : "Use the email your invite was sent to. Pick a password you'll remember."
                  : [
                      fans
                        ? "One account, whether you coach or you're here to train."
                        : null,
                      inviteOnly && !inviter
                        ? "Invite-only beta: use your invited email."
                        : "Pick any password and you're in.",
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
            <input
              type="password"
              className="editinput"
              style={{ marginTop: 10 }}
              placeholder="Password"
              autoComplete={sheet === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitPassword()}
            />
            {/* Recovery, said in the words people look for, and sitting where
                the problem is — right under the field they can't fill in. */}
            {sheet === "login" && (
              <button className="authforgot" onClick={() => sendLink(true)} disabled={pending}>
                Forgot your password?
              </button>
            )}
            {/* The other ways in, both as buttons: they're alternatives to the
                password, not footnotes about it. */}
            <div className="obalts" style={{ marginTop: 14 }}>
              <button className="obalt" onClick={() => sendLink(false)} disabled={pending}>
                <Icon name="auto_awesome" size={21} /> Email me a magic link
              </button>
              {sheet === "login" && passkeyable && knownPasskey && (
                <button className="obalt" onClick={usePasskeyLogin} disabled={pending}>
                  <Icon name="fingerprint" size={21} /> {passkeyLabel}
                </button>
              )}
            </div>
            {error && <div className="errorcopy" style={{ textAlign: "left" }}>{error}</div>}
            {inviteOnly && !invited && !inviter && sheet === "signup" && (
              <button className="authmagic" onClick={openRequest}>
                Not invited yet? Request an invite
              </button>
            )}
            <div className="publishwrap nostick">
              <button className="btn si" onClick={submitPassword} disabled={pending}>
                {pending ? "One sec…" : sheet === "signup" ? "Create account" : "Sign in"}
              </button>
            </div>
            {sheet === "signup" && (
              <p className="authsignup-legal">
                By creating an account, you agree to FittList&rsquo;s <span>Terms of Use</span> and acknowledge our <Link href="/privacy">Privacy Policy</Link>.
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

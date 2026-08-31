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

const landingCalendars = [
  ["All", "calendar_month", "neutral"],
  ["You", "Y", "rose"],
  ["Maya", "M", "blue"],
  ["Theo", "T", "gold"],
] as const;

const landingClasses = [
  ["Today", "Maya Ortiz", "Sunrise Flow", "Northline Yoga", "7:00am", "M", "blue"],
  ["Today", "Theo Brooks", "Strength Lab", "Iron House", "5:30pm", "T", "gold"],
  ["Tomorrow", "You", "Waterfront Run Club", "Pier Track", "6:00pm", "Y", "rose"],
  ["Sat, Sep 5", "Lena Park", "Reformer Basics", "Studio Arc", "9:00am", "L", "mint"],
] as const;

function PhoneStatusIcons() {
  return (
    <span className="obwelcome-status-icons" aria-hidden="true">
      <Icon name="signal_cellular_alt" size={15} />
      <Icon name="wifi" size={15} />
      <Icon name="battery_full" size={16} />
    </span>
  );
}

function LandingCalendarMockup() {
  let priorDay = "";
  return (
    <div className="obwelcome-phone" role="img" aria-label="A sample FittList calendar with fictional coaches, classes, and studios">
      <div className="obwelcome-status"><b>9:41</b><PhoneStatusIcons /></div>
      <div className="obwelcome-phone-head"><h2>Calendar</h2><span><Icon name="notifications" size={18} /></span></div>
      <div className="obwelcome-calendars">
        {landingCalendars.map(([name, mark, tone]) => (
          <div key={name}>
            <span data-tone={tone}>{mark === "calendar_month" ? <Icon name={mark} size={20} /> : mark}</span>
            <small>{name}</small>
          </div>
        ))}
      </div>
      <div className="obwelcome-context"><span>Following 4 calendars</span><b>View all</b></div>
      <div className="obwelcome-schedule">
        {landingClasses.map(([day, person, name, studio, time, initial, tone]) => {
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
      <div className="obwelcome-phone-nav" aria-hidden="true">
        <span className="on"><Icon name="calendar_month" size={20} /></span>
        <span><Icon name="search" size={20} /></span>
        <span><Icon name="account_circle" size={20} /></span>
        <span><Icon name="reply" size={20} /></span>
      </div>
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
                  Sign up <Icon name="arrow_forward" size={18} />
                </button>
                <button type="button" className="obwelcome-login-button" onClick={() => { setError(""); setSheet("login"); }}>
                  Log in
                </button>
              </nav>
            </header>
            <div className="obwelcome-grid">
              <div className="obwelcome-title">
                <h1>Your whole week in fitness in one place.</h1>
              </div>
              <div className="obwelcome-device"><LandingCalendarMockup /></div>
              <div className="obwelcome-copy">
                <p>See your classes, coaches, and studios in one live week. Keep it current and share it anywhere.</p>
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

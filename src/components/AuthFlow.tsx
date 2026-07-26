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
import { slug } from "@/lib/format";
import { brandIcon } from "@/lib/brand";
import { Icon } from "@/components/Icon";
import { Wordmark } from "@/components/Wordmark";

type Stage = "landing" | "sent" | "claim";
type SheetMode = "signup" | "login";

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
}: {
  startStage: "email" | "claim";
  via?: string | null;
  providers?: { google: boolean; apple: boolean };
  inviteOnly?: boolean;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const [stage, setStage] = useState<Stage>(startStage === "claim" ? "claim" : "landing");
  const [sheet, setSheet] = useState<SheetMode | null>(null);
  const [bio, setBio] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [error, setError] = useState(
    search.get("invite")
      ? "Fittlist is invite-only during beta. Request an invite below, then sign in with that email."
      : search.get("expired")
        ? "That link expired. Try again."
        : "",
  );
  const [pending, startTransition] = useTransition();
  const [passkeyable, setPasskeyable] = useState(false);
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
  }, []);
  useEffect(() => {
    if (stage === "claim") nameRef.current?.focus();
  }, [stage]);

  const proceed = (needsProfile: boolean) => {
    if (needsProfile) setStage("claim");
    else router.push("/app");
  };

  const submitPassword = () => {
    if (!email.trim() || !password) return;
    setError("");
    startTransition(async () => {
      const res = await passwordAuth(email, password);
      if (!res.ok) {
        setError(res.error ?? "Something went wrong.");
        return;
      }
      setSheet(null);
      pendingProfile.current = !!res.needsProfile;
      // Offer to add a passkey right after signing in with a password.
      if (passkeyable && !res.hasPasskey) setBio(true);
      else proceed(!!res.needsProfile);
    });
  };

  const sendLink = () => {
    if (!email.trim()) {
      setError("Enter your email first.");
      return;
    }
    setError("");
    startTransition(async () => {
      const res = await requestMagicLink(email, via);
      if (res.ok) {
        setSheet(null);
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
          await finishPasskeyRegistration(reg, "Passkey");
        }
      } catch {
        /* user cancelled or it failed — either way, continue */
      }
      setBio(false);
      proceed(pendingProfile.current);
    });
  };

  const usePasskeyLogin = () => {
    setError("");
    startTransition(async () => {
      try {
        const { options } = await beginPasskeyLogin();
        const response = await startAuthentication({ optionsJSON: options });
        const res = await finishPasskeyLogin(response);
        if (res.ok) proceed(!!res.needsProfile);
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
      const res = await claimProfile(name, handle, via);
      if (res.ok) router.push("/welcome");
      else setError(res.error ?? "Something went wrong.");
    });
  };

  const urlPreview = slug(handle.trim() || name) || "yourname";

  return (
    <section className="screen ob">
      <div className="pad">
        <Wordmark variant="ink" className="mark" beta />

        {stage === "landing" && (
          <>
            <div className="obhero">
              <span className="obmark" aria-hidden="true" dangerouslySetInnerHTML={{ __html: brandIcon("#dd6a35") }} />
            </div>
            <h1>
              The link in bio,
              <br />
              built for coaches.
            </h1>
            <p>
              Your classes across every studio, plus every way to book and reach you. One link in your
              bio.
            </p>

            <button className="btn" onClick={() => { setError(""); setSheet("signup"); }}>
              Sign up with email
            </button>
            {(providers.google || providers.apple) && (
              <div className="obalts" style={{ marginTop: 12 }}>
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
            <button className="obloginlink" onClick={() => { setError(""); setSheet("login"); }}>
              Already have an account? <b>Log in</b>
            </button>
            {inviteOnly && (
              <button className="obloginlink" onClick={openRequest}>
                Not invited yet? <b>Request an invite</b>
              </button>
            )}
          </>
        )}

        {stage === "sent" && (
          <>
            <h1>Check your inbox.</h1>
            <p>
              We emailed a one-tap sign-in link to <b>{email}</b>. Open it on this device and
              you&rsquo;re in. It expires in 15 minutes.
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
              This is the one link you share everywhere &mdash; your bio, your DMs, your business card.
              Anyone who opens it sees your schedule and how to reach you.
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
              Your page will live at <b>fittlist.co/{urlPreview}</b>
            </div>
            <button className="btn" onClick={claim} disabled={pending}>
              {pending ? "Claiming…" : "Claim it"}
            </button>
            {error && <div className="errorcopy">{error}</div>}
          </>
        )}
      </div>

      {/* email + password bottom sheet (sign up or log in) */}
      {sheet && (
        <div className="sheet-scrim" onClick={(e) => { if (e.target === e.currentTarget) setSheet(null); }}>
          <div className="sheet">
            <button className="iconbtn sheetclose" aria-label="Close" onClick={() => setSheet(null)}>
              <Icon name="close" size={16} />
            </button>
            <h2>{sheet === "signup" ? "Sign up with email" : "Log in"}</h2>
            <p className="lead">
              {sheet === "signup"
                ? inviteOnly
                  ? "Invite-only beta. Use the email you were invited with."
                  : "Pick any password and you're in."
                : "Welcome back — enter your email and password."}
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
            <button className="authmagic" onClick={sendLink} disabled={pending}>
              Email me a magic link instead
            </button>
            {sheet === "login" && passkeyable && (
              <button className="obalt" style={{ marginTop: 6 }} onClick={usePasskeyLogin} disabled={pending}>
                <Icon name="fingerprint" size={19} /> Use a passkey
              </button>
            )}
            {error && <div className="errorcopy" style={{ textAlign: "left" }}>{error}</div>}
            {inviteOnly && sheet === "signup" && (
              <button className="authmagic" onClick={openRequest}>
                Not invited yet? Request an invite
              </button>
            )}
            <div className="publishwrap nostick">
              <button className="btn si" onClick={submitPassword} disabled={pending}>
                {pending ? "One sec…" : sheet === "signup" ? "Create account" : "Log in"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* biometric enrollment prompt after a password sign-in */}
      {bio && (
        <div className="sheet-scrim" onClick={(e) => { if (e.target === e.currentTarget) { setBio(false); proceed(pendingProfile.current); } }}>
          <div className="sheet">
            <div className="bioicon"><Icon name="fingerprint" size={30} /></div>
            <h2>Sign in faster next time?</h2>
            <p className="lead">
              Add Face ID, Touch ID, or your fingerprint and skip the password next time you log in.
            </p>
            <div className="publishwrap">
              <button className="btn si" onClick={enrollBiometric} disabled={pending}>
                {pending ? "…" : "Use biometrics"}
              </button>
              <button
                className="btn ghost"
                style={{ marginTop: 8 }}
                disabled={pending}
                onClick={() => { setBio(false); proceed(pendingProfile.current); }}
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
              <Icon name="close" size={16} />
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

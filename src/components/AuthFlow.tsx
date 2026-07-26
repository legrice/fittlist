"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import {
  beginPasskeyLogin,
  claimProfile,
  finishPasskeyLogin,
  passwordAuth,
  requestMagicLink,
} from "@/app/actions/auth";
import { slug } from "@/lib/format";
import { brandIcon } from "@/lib/brand";
import { Icon } from "@/components/Icon";
import { Wordmark } from "@/components/Wordmark";

type Stage = "email" | "sent" | "claim";

const GoogleG = () => (
  <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true">
    <path
      fill="#EA4335"
      d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.4 30.3 0 24 0 14.6 0 6.4 5.4 2.5 13.3l7.9 6.1C12.3 13.2 17.7 9.5 24 9.5z"
    />
    <path
      fill="#4285F4"
      d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.5 3-2.2 5.5-4.7 7.2l7.3 5.7C43.9 37.9 46.5 31.8 46.5 24.5z"
    />
    <path
      fill="#FBBC05"
      d="M10.4 28.6c-.5-1.5-.8-3-.8-4.6s.3-3.1.8-4.6l-7.9-6.1C.9 16.5 0 20.1 0 24s.9 7.5 2.5 10.7l7.9-6.1z"
    />
    <path
      fill="#34A853"
      d="M24 48c6.3 0 11.6-2.1 15.5-5.7l-7.3-5.7c-2 1.4-4.7 2.3-8.2 2.3-6.3 0-11.7-3.7-13.6-9.9l-7.9 6.1C6.4 42.6 14.6 48 24 48z"
    />
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
}: {
  startStage: Stage;
  via?: string | null;
  providers?: { google: boolean; apple: boolean };
}) {
  const router = useRouter();
  const viaQ = via ? `?via=${encodeURIComponent(via)}` : "";
  const search = useSearchParams();
  const [stage, setStage] = useState<Stage>(startStage);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState(search.get("expired") ? "That link expired. Try again." : "");
  const [pending, startTransition] = useTransition();
  const [passkeyable, setPasskeyable] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPasskeyable(typeof window !== "undefined" && !!window.PublicKeyCredential);
  }, []);
  useEffect(() => {
    if (stage === "claim") nameRef.current?.focus();
  }, [stage]);

  const afterAuth = (needsProfile?: boolean) => {
    if (needsProfile) setStage("claim");
    else router.push("/app");
  };

  const submitPassword = () => {
    if (!email.trim() || !password) return;
    setError("");
    startTransition(async () => {
      const res = await passwordAuth(email, password);
      if (res.ok) afterAuth(res.needsProfile);
      else setError(res.error ?? "Something went wrong.");
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
      if (res.ok) setStage("sent");
      else setError(res.error ?? "Something went wrong.");
    });
  };

  const usePasskey = () => {
    setError("");
    startTransition(async () => {
      try {
        const { options } = await beginPasskeyLogin();
        const response = await startAuthentication({ optionsJSON: options });
        const res = await finishPasskeyLogin(response);
        if (res.ok) afterAuth(res.needsProfile);
        else setError(res.error ?? "That didn't work.");
      } catch (err) {
        const nm = (err as Error)?.name;
        if (nm !== "AbortError" && nm !== "NotAllowedError") {
          setError("Couldn't use a passkey. Try your email instead.");
        }
      }
    });
  };

  const claim = () => {
    if (!name.trim()) return;
    setError("");
    startTransition(async () => {
      const res = await claimProfile(name, via);
      if (res.ok) router.push("/app?add=1");
      else setError(res.error ?? "Something went wrong.");
    });
  };

  const handle = name.trim() ? slug(name) : "…";

  return (
    <section className="screen ob">
      <div className="pad">
        <Wordmark variant="ink" className="mark" />

        {stage === "email" && (
          <>
            <div className="obhero">
              <span
                className="obmark"
                aria-hidden="true"
                dangerouslySetInnerHTML={{ __html: brandIcon("#dd6a35") }}
              />
            </div>
            <h1>
              Never answer
              <br />
              &ldquo;what&rsquo;s your
              <br />
              schedule?&rdquo; again.
            </h1>
            <p>
              One link in your bio, every gym you coach at. Log in, or pick a password to start a new
              page.
            </p>
            <input
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              type="password"
              placeholder="Password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitPassword()}
            />
            <button className="btn" onClick={submitPassword} disabled={pending}>
              {pending ? "One sec…" : "Continue"}
            </button>
            {error && <div className="errorcopy">{error}</div>}

            <div className="obdiv">
              <span>or</span>
            </div>
            <div className="obalts">
              {providers.google && (
                <a className="obalt google" href={`/api/google/login${viaQ}`}>
                  <GoogleG />
                  Continue with Google
                </a>
              )}
              {providers.apple && (
                <a className="obalt apple" href={`/api/apple/login${viaQ}`}>
                  <AppleLogo />
                  Continue with Apple
                </a>
              )}
              <button className="obalt" onClick={sendLink} disabled={pending}>
                <Icon name="mail" size={19} />
                Email me a magic link
              </button>
              {passkeyable && (
                <button className="obalt" onClick={usePasskey} disabled={pending}>
                  <Icon name="fingerprint" size={19} />
                  Sign in with a passkey
                </button>
              )}
            </div>
            <div className="microcopy">New here? Pick any password and you&rsquo;re in.</div>
          </>
        )}

        {stage === "sent" && (
          <>
            <h1>Check your inbox.</h1>
            <p>
              We emailed a one-tap sign-in link to <b>{email}</b>. Open it on this device and
              you&rsquo;re in. It expires in 15 minutes.
            </p>
            <button className="btn ghost" onClick={() => setStage("email")}>
              Back
            </button>
            {error && <div className="errorcopy">{error}</div>}
            <div className="microcopy">The link works once. Request a new one any time.</div>
          </>
        )}

        {stage === "claim" && (
          <>
            <h1>Claim your page.</h1>
            <p>Your name becomes your link. That&rsquo;s the whole signup.</p>
            <input
              ref={nameRef}
              placeholder="Matt"
              autoComplete="off"
              maxLength={24}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && claim()}
            />
            <div className="handlepreview">
              fittlist.co/<b>{handle}</b>
            </div>
            <button className="btn" onClick={claim} disabled={pending}>
              {pending ? "Claiming…" : "Claim it"}
            </button>
            {error && <div className="errorcopy">{error}</div>}
          </>
        )}
      </div>
    </section>
  );
}

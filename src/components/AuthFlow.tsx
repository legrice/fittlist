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

export function AuthFlow({ startStage, via = null }: { startStage: Stage; via?: string | null }) {
  const router = useRouter();
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

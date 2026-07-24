"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { claimProfile, requestCode, verifyCode } from "@/app/actions/auth";
import { slug } from "@/lib/format";
import { Wordmark } from "@/components/Wordmark";

type Stage = "email" | "code" | "claim";

export function AuthFlow({ startStage, via = null }: { startStage: Stage; via?: string | null }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>(startStage);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const codeRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (stage === "code") codeRef.current?.focus();
    if (stage === "claim") nameRef.current?.focus();
  }, [stage]);

  const sendCode = () => {
    if (!email.trim()) return;
    setError("");
    startTransition(async () => {
      const res = await requestCode(email);
      if (res.ok) {
        setCode("");
        setStage("code");
      } else setError(res.error ?? "Something went wrong.");
    });
  };

  const verify = () => {
    setError("");
    startTransition(async () => {
      const res = await verifyCode(email, code);
      if (!res.ok) {
        setError(res.error ?? "Something went wrong.");
        return;
      }
      if (res.needsProfile) setStage("claim");
      else router.push("/app");
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
      <Wordmark variant="cloud" className="mark" />
      <div className="pad">
        {stage === "email" && (
          <>
            <h1>
              Never answer
              <br />
              &ldquo;what&rsquo;s your
              <br />
              schedule?&rdquo; again.
            </h1>
            <p>
              One link in your bio, every gym you coach at. Log in with your email. We send a code —
              no passwords.
            </p>
            <input
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendCode()}
            />
            <button className="btn" onClick={sendCode} disabled={pending}>
              {pending ? "Sending…" : "Email me a code"}
            </button>
            {error && <div className="errorcopy">{error}</div>}
            <div className="microcopy">Email login. No passwords to forget.</div>
          </>
        )}

        {stage === "code" && (
          <>
            <h1>Check your inbox.</h1>
            <p>
              We sent a 6-digit code to <b>{email}</b>.
            </p>
            <input
              ref={codeRef}
              className="code"
              inputMode="numeric"
              maxLength={6}
              placeholder="••••••"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && code.length === 6 && verify()}
            />
            <button className="btn" onClick={verify} disabled={pending || code.length < 6}>
              {pending ? "Checking…" : "Verify"}
            </button>
            <button className="backlink" onClick={() => setStage("email")}>
              Wrong email?
            </button>
            {error && <div className="errorcopy">{error}</div>}
            <div className="microcopy">Codes expire after 10 minutes.</div>
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

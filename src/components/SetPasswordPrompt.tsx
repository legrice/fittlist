"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dismissPasswordPrompt, setPassword } from "@/app/actions/auth";
import { BodyPortal } from "@/components/BodyPortal";
import { Icon } from "@/components/Icon";
import type { PasswordPromptMode } from "@/lib/session";

/** Offered once after a passwordless login. It lives in the shared tab shell,
 * so both established accounts and people finishing onboarding reach it. */
export function SetPasswordPrompt({ mode }: { mode: PasswordPromptMode }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const [password, setPasswordValue] = useState("");
  const [error, setError] = useState("");
  const [visible, setVisible] = useState(true);
  const [pending, startTransition] = useTransition();

  const dismiss = useCallback(() => {
    if (pending) return;
    setVisible(false);
    startTransition(async () => {
      await dismissPasswordPrompt();
      router.refresh();
    });
  }, [pending, router]);

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    inputRef.current?.focus();
    return () => previousFocusRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        dismiss();
        return;
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dismiss]);

  if (!visible) return null;
  const resetting = mode === "reset";

  const save = () => {
    if (pending) return;
    setError("");
    startTransition(async () => {
      const result = await setPassword(password);
      if (!result.ok) {
        setError(result.error ?? "Couldn't save that password.");
        return;
      }
      setVisible(false);
      router.refresh();
    });
  };

  return (
    <BodyPortal>
      <div className="sheet-scrim setpw-scrim">
        <div ref={dialogRef} className="sheet confirmsheet setpw-sheet" role="dialog" aria-modal="true" aria-labelledby="setpw-title" aria-describedby="setpw-description">
          <button className="iconbtn sheetclose" type="button" aria-label={resetting ? "Cancel password reset" : "Not now"} onClick={dismiss} disabled={pending}>
            <Icon name="close" size={18} />
          </button>
          <h2 id="setpw-title">{resetting ? "Reset your password" : "Set a password"}</h2>
          <p className="lead" id="setpw-description">
            {resetting
              ? "Choose a new password for this account. Your email link has been confirmed and works only for this reset."
              : "Sign in next time without waiting for another email. Magic links and passkeys will still work."}
          </p>
          <label className="flabel" htmlFor="setpw-password">New password</label>
          <input
            ref={inputRef}
            id="setpw-password"
            className="editinput"
            type="password"
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPasswordValue(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") save(); }}
            aria-describedby={error ? "setpw-error" : undefined}
          />
          {error && <div className="errorcopy" id="setpw-error" role="alert">{error}</div>}
          <div className="publishwrap nostick">
            <button className="btn si" type="button" onClick={save} disabled={pending || password.length < 8}>
              {pending ? "Saving…" : resetting ? "Reset password" : "Save password"}
            </button>
          </div>
          <button className="confirm-keep" type="button" onClick={dismiss} disabled={pending}>
            {resetting ? "Cancel reset" : "Not now"}
          </button>
        </div>
      </div>
    </BodyPortal>
  );
}

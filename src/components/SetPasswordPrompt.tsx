"use client";

import { useState, useTransition } from "react";
import { setPassword as setPasswordAction } from "@/app/actions/auth";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";

// Shown once, right after someone signs in with a magic link on an account that
// has no password and no passkey. Without this they can only ever get back in
// through their inbox — which reads as "it logged me out" the first time they
// open the app in a different browser.
export function SetPasswordPrompt({ email }: { email: string }) {
  const [open, setOpen] = useState(true);
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();

  const dismiss = () => {
    setOpen(false);
    // Drop the flag so a refresh doesn't ask again.
    window.history.replaceState(null, "", window.location.pathname);
  };

  const save = () =>
    start(async () => {
      setErr("");
      const res = await setPasswordAction(pw);
      if (!res.ok) {
        setErr(res.error ?? "Something went wrong.");
        return;
      }
      dismiss();
      toast("Password set. You can sign in anywhere now");
    });

  return (
    <>
      {open && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget && !pending) dismiss();
          }}
        >
          <div className="sheet">
            <button className="iconbtn sheetclose" aria-label="Close" onClick={dismiss}>
              <Icon name="close" size={18} />
            </button>
            <h2>Set a password</h2>
            <p className="lead">
              You signed in with an emailed link, so this account doesn&rsquo;t have a password yet.
              Pick one now and you can sign in from any browser without waiting on an email.
            </p>
            <label className="flabel" htmlFor="spwNew">
              New password <span>· for {email}</span>
            </label>
            <input
              type="password"
              id="spwNew"
              className="editinput"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
            />
            {err && (
              <div className="errorcopy" style={{ textAlign: "left" }}>
                {err}
              </div>
            )}
            <div className="publishwrap nostick">
              <button className="btn si" disabled={pending || pw.length < 8} onClick={save}>
                {pending ? "Saving…" : "Set password"}
              </button>
              <button
                className="tertiary"
                style={{ display: "block", margin: "10px auto 0" }}
                disabled={pending}
                onClick={dismiss}
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      )}
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}

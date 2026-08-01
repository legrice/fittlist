"use client";

import { useState, useTransition } from "react";
import { sendInquiry } from "@/app/actions/inquiries";
import { Icon } from "@/components/Icon";

// The composer itself, without a sheet around it. `ContactSheet` renders it
// as the top way of reaching somebody, and the buttons below render it inside
// their own sheet; one form either way, because two would drift.
//
// A signed-in member is not asked who they are. fittlist already knows their
// name and email, `sendInquiry` reads both off the session, and a form asking
// a member to type their own email back at us was the thing standing between
// them and saying one sentence to their coach.
export function MessageComposer({
  handle,
  coachName,
  signedIn,
  onDone,
}: {
  handle: string;
  coachName: string;
  signedIn: boolean;
  /** Called once it's away, so a sheet can close itself or say so. */
  onDone?: () => void;
}) {
  const [sent, setSent] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const first = coachName.trim().split(/\s+/)[0] || coachName;

  const submit = () => {
    setError("");
    start(async () => {
      const res = await sendInquiry(handle, name, email, message, phone);
      if (!res.ok) {
        setError(res.error ?? "Something went wrong.");
        return;
      }
      setSent(true);
      onDone?.();
    });
  };

  if (sent) {
    return (
      <>
        <h2 style={{ marginTop: 10 }}>Message sent</h2>
        <p className="lead">
          {signedIn
            ? `${first} has it. Their reply lands in your inbox here and in your email.`
            : `${first} got your message and will reply to your email. You can keep the conversation going right from there.`}
        </p>
      </>
    );
  }

  return (
    <>
      {!signedIn && (
        <>
          <label className="flabel" htmlFor="rqName">
            Your name
          </label>
          <input
            id="rqName"
            className="editinput"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <label className="flabel" htmlFor="rqEmail">
            Your email
          </label>
          <input
            id="rqEmail"
            className="editinput"
            type="email"
            autoCapitalize="none"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <label className="flabel" htmlFor="rqPhone">
            Phone <span>&middot; optional, if you&rsquo;d rather be called</span>
          </label>
          <input
            id="rqPhone"
            className="editinput"
            type="tel"
            autoComplete="tel"
            placeholder="555 555 5555"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </>
      )}
      <label className="flabel" htmlFor="rqMsg">
        Message
      </label>
      <textarea
        id="rqMsg"
        className="editinput reqmsg"
        rows={4}
        maxLength={2000}
        placeholder="e.g. Is Tuesday’s class open to drop-ins?"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      {error && <div className="errorcopy">{error}</div>}
      <div className="publishwrap">
        <button
          className="btn si"
          disabled={pending || !message.trim() || (!signedIn && !email.trim())}
          onClick={submit}
        >
          {pending ? "Sending…" : `Send to ${first}`}
        </button>
      </div>
    </>
  );
}

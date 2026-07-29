"use client";

import { useState, useTransition } from "react";
import { sendInquiry } from "@/app/actions/inquiries";
import { Icon } from "@/components/Icon";

// Public "Request private session" CTA + composer. Sends the coach an email
// and starts an inbox thread; the visitor replies later via a link.
export function RequestSessionButton({ handle, coachName }: { handle: string; coachName: string }) {
  const [open, setOpen] = useState(false);
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
    });
  };

  return (
    <>
      <button className="btn si reqbtn" onClick={() => { setSent(false); setError(""); setOpen(true); }}>
        <Icon name="send" size={18} /> Request private session
      </button>

      {open && (
        <div className="sheet-scrim" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="sheet">
            <button className="iconbtn sheetclose" aria-label="Close" onClick={() => setOpen(false)}>
              <Icon name="close" size={16} />
            </button>
            {sent ? (
              <>
                <h2 style={{ marginTop: 10 }}>Message sent</h2>
                <p className="lead">
                  {first} got your message and will reply to <b>{email}</b>. You can keep the
                  conversation going right from that email.
                </p>
                <div className="publishwrap">
                  <button className="btn si" onClick={() => setOpen(false)}>Done</button>
                </div>
              </>
            ) : (
              <>
                <h2 style={{ marginTop: 10 }}>Request a private session</h2>
                <p className="lead">Tell {first} what you&rsquo;re after. They&rsquo;ll reply by email.</p>
                <label className="flabel" htmlFor="rqName">Your name</label>
                <input id="rqName" className="editinput" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
                <label className="flabel" htmlFor="rqEmail">Your email</label>
                <input id="rqEmail" className="editinput" type="email" autoCapitalize="none" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                <label className="flabel" htmlFor="rqPhone">
                  Phone <span>&middot; optional, if you&rsquo;d rather be called</span>
                </label>
                <input id="rqPhone" className="editinput" type="tel" autoComplete="tel" placeholder="555 555 5555" value={phone} onChange={(e) => setPhone(e.target.value)} />
                <label className="flabel" htmlFor="rqMsg">Message</label>
                <textarea
                  id="rqMsg"
                  className="editinput reqmsg"
                  rows={4}
                  maxLength={2000}
                  placeholder="e.g. Looking for 1:1 strength coaching, twice a week."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
                {error && <div className="errorcopy">{error}</div>}
                <div className="publishwrap">
                  <button className="btn si" disabled={pending || !message.trim() || !email.trim()} onClick={submit}>
                    {pending ? "Sending…" : "Send message"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { markFeedbackPrompted, sendFeedback } from "@/app/actions/feedback";

// "How's it going?", once, after they've used the app long enough to know.
//
// Whether it's due is decided on the server (see feedbackPromptDue); this only
// renders it. The box is right here rather than a link to the feedback screen:
// the whole point is to catch the thought while they're having it, and a
// navigation is where that thought goes to die.
//
// Shown counts as asked, so closing it without typing is a real answer and the
// app doesn't open with the same question tomorrow.
export function FeedbackPrompt({ hostName }: { hostName: string }) {
  const [open, setOpen] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [sending, setSending] = useState(false);
  const marked = useRef(false);

  useEffect(() => {
    setMounted(true);
    if (marked.current) return;
    marked.current = true;
    markFeedbackPrompted().catch(() => {});
  }, []);

  const send = async () => {
    if (!body.trim() || sending) return;
    setSending(true);
    setError("");
    const res = await sendFeedback(body);
    setSending(false);
    if (!res.ok) {
      setError(res.error ?? "Couldn't send that.");
      return;
    }
    setDone(true);
  };

  if (!open || !mounted) return null;

  return createPortal(
    <div className="confirm-scrim" role="dialog" aria-modal="true" aria-label="Feedback">
      <div className="confirm-modal fbmodal">
        {done ? (
          <>
            <h3>Got it, thank you.</h3>
            <p>
              {hostName} reads every one of these. Their reply will show up in the app, under
              Send feedback.
            </p>
            <button className="btn si" onClick={() => setOpen(false)}>
              Close
            </button>
          </>
        ) : (
          <>
            <h3>How is it going?</h3>
            <p>
              You have been using fittlist for a bit. What is missing, what got in your way, or
              what would you change? {hostName} builds this, and answers here.
            </p>
            <textarea
              className="editinput fbmodal-in"
              rows={4}
              maxLength={2000}
              placeholder="The thing I keep wanting is…"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              autoFocus
            />
            {error && <div className="errorcopy">{error}</div>}
            <button className="btn si" disabled={sending || !body.trim()} onClick={send}>
              {sending ? "Sending…" : "Send it"}
            </button>
            <button className="confirm-keep" disabled={sending} onClick={() => setOpen(false)}>
              Not right now
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

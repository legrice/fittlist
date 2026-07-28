"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { sendFeedback } from "@/app/actions/feedback";
import { ChatMessages } from "@/components/ChatMessages";

type Msg = { id: string; fromCoach: boolean; body: string; createdAt: Date | string };

// The other end of the feedback door: your thread with whoever runs the app.
//
// Empty the first time, and the empty state has to do the asking. "Send
// feedback" on its own gets you "love it, thanks"; naming what's useful gets
// you the class that vanished when someone edited its description.
export function FeedbackThread({
  hostName,
  messages,
}: {
  hostName: string;
  messages: Msg[];
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, start] = useTransition();

  const send = () => {
    if (!body.trim()) return;
    setError("");
    start(async () => {
      const res = await sendFeedback(body);
      if (!res.ok) {
        setError(res.error ?? "Couldn't send that.");
        return;
      }
      setBody("");
      setSent(true);
      router.refresh();
    });
  };

  return (
    <>
      {messages.length > 0 ? (
        <div className="chatbody">
          <ChatMessages messages={messages} mineIsCoach={false} />
        </div>
      ) : (
        <div className="fbintro">
          <p>
            Anything you tell {hostName} here goes straight to them, and they answer in this
            thread. It stays open, so you can keep adding to it.
          </p>
          <p className="fbintro-s">
            What helps most: something that broke, something that took longer than it should
            have, or something you wanted and could not find.
          </p>
        </div>
      )}

      {sent && messages.length > 0 && (
        <p className="fbsent">Sent. You will get a note here when they reply.</p>
      )}

      <div className="chatreply">
        <textarea
          className="editinput"
          rows={4}
          maxLength={2000}
          placeholder={messages.length ? "Write a reply…" : "What happened?"}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        {error && <div className="errorcopy">{error}</div>}
        <button className="btn si" disabled={pending || !body.trim()} onClick={send}>
          {pending ? "Sending…" : messages.length ? "Send" : "Send feedback"}
        </button>
      </div>
    </>
  );
}

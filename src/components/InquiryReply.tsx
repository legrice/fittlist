"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { replyByToken, replyToInquiry } from "@/app/actions/inquiries";

// Reply box shared by the coach's inbox thread (threadId) and the visitor's
// tokenized thread page (token).
export function InquiryReply({ threadId, token }: { threadId?: string; token?: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const send = () => {
    if (!body.trim()) return;
    setError("");
    start(async () => {
      const res = threadId ? await replyToInquiry(threadId, body) : await replyByToken(token!, body);
      if (!res.ok) {
        setError(res.error ?? "Couldn't send that.");
        return;
      }
      setBody("");
      router.refresh();
    });
  };

  return (
    <div className="chatreply">
      <textarea
        className="editinput"
        rows={2}
        maxLength={2000}
        placeholder="Write a reply…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      {error && <div className="errorcopy">{error}</div>}
      <button className="btn si" disabled={pending || !body.trim()} onClick={send}>
        {pending ? "Sending…" : "Send"}
      </button>
    </div>
  );
}

"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reportContent, reportMessageByToken, type ContentReportReason, type ReportableContentType } from "@/app/actions/content-reports";
import { BodyPortal } from "@/components/BodyPortal";
import { Icon } from "@/components/Icon";

const REASONS: ContentReportReason[] = [
  "Harassment or bullying",
  "Hate or threats",
  "Sexual content",
  "Spam or scam",
  "Impersonation",
  "Private information",
  "Something else",
];

export function ReportContentButton({
  contentType,
  contentId,
  label = "Report",
  className = "content-report-button",
  canBlock = false,
  blockLabel = "Also block this account",
  token,
  onReported,
}: {
  contentType: ReportableContentType;
  contentId: string;
  label?: string;
  className?: string;
  canBlock?: boolean;
  blockLabel?: string;
  token?: string;
  onReported?: () => void;
}) {
  const router = useRouter();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ContentReportReason | "">("");
  const [note, setNote] = useState("");
  const [blockAuthor, setBlockAuthor] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const send = () => {
    if (!reason || pending) return;
    setMessage("");
    start(async () => {
      const result = token
        ? await reportMessageByToken({ token, messageId: contentId, reason, note, stopConversation: canBlock && blockAuthor })
        : await reportContent({ contentType, contentId, reason, note, blockAuthor: canBlock && blockAuthor });
      if (!result.ok) {
        setMessage(result.error ?? "Couldn’t send that report.");
        return;
      }
      setOpen(false);
      setReason("");
      setNote("");
      setBlockAuthor(false);
      setMessage(result.blocked ? (contentType === "inquiry_message" ? "Report sent and conversation stopped." : "Report sent and account blocked.") : result.alreadyReported ? "You already reported this." : "Thanks. We’ll review it.");
      onReported?.();
      router.refresh();
    });
  };

  return (
    <>
      <button type="button" className={className} onClick={() => { setMessage(""); setOpen(true); }} aria-haspopup="dialog">
        <Icon name="flag" size={16} /> <span>{label}</span>
      </button>
      {message && <span className="content-report-status" role="status">{message}</span>}
      <BodyPortal>
        {open && (
          <div className="sheet-scrim" onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
            <div className="sheet content-report-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId}>
              <button type="button" className="iconbtn sheetclose" aria-label="Close report" onClick={() => setOpen(false)}><Icon name="close" size={18} /></button>
              <h2 id={titleId}>Report this content</h2>
              <p className="lead">Tell us what’s wrong. The person who posted it won’t see who reported it.</p>
              <fieldset className="content-report-reasons">
                <legend>Reason</legend>
                {REASONS.map((item) => (
                  <label key={item}>
                    <input type="radio" name={`${titleId}-reason`} checked={reason === item} onChange={() => setReason(item)} />
                    <span>{item}</span>
                  </label>
                ))}
              </fieldset>
              <label className="flabel" htmlFor={`${titleId}-note`}>Anything else? <span>(optional)</span></label>
              <textarea id={`${titleId}-note`} className="abouttext" rows={3} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} />
              {canBlock && <label className="content-report-block"><input type="checkbox" checked={blockAuthor} onChange={(event) => setBlockAuthor(event.target.checked)} /><span>{blockLabel}</span></label>}
              {message && <p className="errorcopy" role="alert">{message}</p>}
              <button type="button" className="btn si" disabled={!reason || pending} onClick={send}>{pending ? "Sending…" : "Send report"}</button>
            </div>
          </div>
        )}
      </BodyPortal>
    </>
  );
}

"use client";

import { useState, useTransition } from "react";
import { reportStudio, suggestStudioEdit } from "@/app/actions/studios";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";

// The correction sheets, opened from the studio menu. Suggest an edit is
// for anyone, signed in or not: the person most worth hearing from is the
// owner, who probably has no account, and the relation field is what turns
// a correction into a lead. Report is the moderation door, same shape as
// reporting a class.

const REASONS = [
  "It closed",
  "Wrong address",
  "Duplicate of another studio",
  "Not a real place",
  "Something else",
];

const RELATIONS = ["I own it", "I manage it", "I coach here", "I train here", "Other"];

// Taking a page down, or taking its keys: both are asks only the people who
// run the place can make, so the chips narrow to the two claims that mean
// that.
const OPTOUT_RELATIONS = ["I own it", "I manage it"];

export function StudioFeedback({
  studioId,
  mode,
  onClose,
  onDone,
}: {
  studioId: string;
  mode: null | "report" | "suggest" | "optout" | "claim";
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [sgName, setSgName] = useState("");
  const [sgEmail, setSgEmail] = useState("");
  const [sgRelation, setSgRelation] = useState("");
  const [sgMessage, setSgMessage] = useState("");
  const [pending, start] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();

  const sendReport = () =>
    start(async () => {
      const res = await reportStudio(studioId, reason, note);
      if (!res.ok) {
        toast(res.error ?? "Couldn't send that.");
        return;
      }
      onClose();
      onDone("Thanks. We'll take a look.");
    });

  const sendSuggestion = () =>
    start(async () => {
      const res = await suggestStudioEdit(studioId, sgName, sgEmail, sgRelation, sgMessage);
      if (!res.ok) {
        toast(res.error ?? "Couldn't send that.");
        return;
      }
      onClose();
      onDone("Thanks. We'll take a look.");
    });

  // The same pipe a suggestion rides, with the ask as its first line so it
  // cannot be mistaken for a correction on the other end.
  // Asking for the keys rides the same pipe too, marked the same way: the
  // first line says exactly what is being asked.
  const sendClaim = () =>
    start(async () => {
      const res = await suggestStudioEdit(
        studioId,
        sgName,
        sgEmail,
        sgRelation,
        `I want to own this page.${sgMessage.trim() ? ` ${sgMessage.trim()}` : ""}`,
      );
      if (!res.ok) {
        toast(res.error ?? "Couldn't send that.");
        return;
      }
      onClose();
      onDone("Thanks. We'll be in touch and set you up.");
    });

  const sendOptout = () =>
    start(async () => {
      const res = await suggestStudioEdit(
        studioId,
        sgName,
        sgEmail,
        sgRelation,
        `Take this page down.${sgMessage.trim() ? ` ${sgMessage.trim()}` : ""}`,
      );
      if (!res.ok) {
        toast(res.error ?? "Couldn't send that.");
        return;
      }
      onClose();
      onDone("Thanks. We'll be in touch and take it down.");
    });

  return (
    <>
      {mode === "report" && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <div className="sheet confirmsheet">
            <button className="iconbtn sheetclose" aria-label="Close" onClick={onClose}>
              <Icon name="close" size={16} />
            </button>
            <h2>Report this studio</h2>
            <p className="lead">
              This goes to fittlist, not to the studio. If it checks out, nothing changes.
            </p>
            <div className="reportpick">
              {REASONS.map((r) => (
                <button
                  key={r}
                  className={`availopt${reason === r ? " sel" : ""}`}
                  onClick={() => setReason(r)}
                >
                  <span className="availopt-txt">
                    <span className="t">{r}</span>
                  </span>
                  {reason === r && <Icon name="check" size={18} />}
                </button>
              ))}
            </div>
            <textarea
              className="editinput"
              style={{ marginTop: 12 }}
              rows={2}
              maxLength={300}
              placeholder="Anything that helps (optional)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="publishwrap nostick">
              <button className="btn si" disabled={pending || !reason} onClick={sendReport}>
                {pending ? "Sending…" : "Send report"}
              </button>
            </div>
          </div>
        </div>
      )}

      {mode === "suggest" && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <div className="sheet">
            <button className="iconbtn sheetclose" aria-label="Close" onClick={onClose}>
              <Icon name="close" size={16} />
            </button>
            <h2>Suggest an edit</h2>
            <p className="lead">
              Something wrong or missing on this page? Tell us and we&rsquo;ll fix it. If this is
              your studio, say so; we&rsquo;d love to hear from you.
            </p>
            <label className="flabel" htmlFor="sgName">Your name</label>
            <input
              id="sgName"
              className="editinput"
              type="text"
              autoComplete="name"
              placeholder="e.g. Jenny Ramos"
              value={sgName}
              onChange={(e) => setSgName(e.target.value)}
            />
            <label className="flabel" htmlFor="sgEmail">Your email</label>
            <input
              id="sgEmail"
              className="editinput"
              type="email"
              autoCapitalize="none"
              autoComplete="email"
              placeholder="you@example.com"
              value={sgEmail}
              onChange={(e) => setSgEmail(e.target.value)}
            />
            <label className="flabel">Your connection to it</label>
            <div className="relpick">
              {RELATIONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`relchip${sgRelation === r ? " sel" : ""}`}
                  onClick={() => setSgRelation(sgRelation === r ? "" : r)}
                >
                  {r}
                </button>
              ))}
            </div>
            <label className="flabel" htmlFor="sgMsg">What should change</label>
            <textarea
              id="sgMsg"
              className="editinput"
              rows={3}
              maxLength={1000}
              placeholder="e.g. The address is old. We moved to 44 Grove St last spring."
              value={sgMessage}
              onChange={(e) => setSgMessage(e.target.value)}
            />
            <div className="publishwrap nostick">
              <button
                className="btn si"
                disabled={pending || !sgEmail.trim() || !sgMessage.trim()}
                onClick={sendSuggestion}
              >
                {pending ? "Sending…" : "Send suggestion"}
              </button>
            </div>
          </div>
        </div>
      )}
      {mode === "claim" && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <div className="sheet">
            <button className="iconbtn sheetclose" aria-label="Close" onClick={onClose}>
              <Icon name="close" size={16} />
            </button>
            <h2>Own this page</h2>
            <p className="lead">
              If you run this studio, this page can be yours: your own schedule, your own
              details, and the Verified badge so everyone knows who speaks for it. Tell us
              who you are and we&rsquo;ll set you up.
            </p>
            <label className="flabel" htmlFor="clName">Your name</label>
            <input
              id="clName"
              className="editinput"
              type="text"
              autoComplete="name"
              placeholder="e.g. Jenny Ramos"
              value={sgName}
              onChange={(e) => setSgName(e.target.value)}
            />
            <label className="flabel" htmlFor="clEmail">Your email</label>
            <input
              id="clEmail"
              className="editinput"
              type="email"
              autoCapitalize="none"
              autoComplete="email"
              placeholder="you@example.com"
              value={sgEmail}
              onChange={(e) => setSgEmail(e.target.value)}
            />
            <label className="flabel">Your connection to it</label>
            <div className="relpick">
              {OPTOUT_RELATIONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`relchip${sgRelation === r ? " sel" : ""}`}
                  onClick={() => setSgRelation(sgRelation === r ? "" : r)}
                >
                  {r}
                </button>
              ))}
            </div>
            <label className="flabel" htmlFor="clMsg">
              Anything we should know <span>&middot; optional</span>
            </label>
            <textarea
              id="clMsg"
              className="editinput"
              rows={2}
              maxLength={1000}
              placeholder="e.g. I'm the owner. Our front desk email is on our site."
              value={sgMessage}
              onChange={(e) => setSgMessage(e.target.value)}
            />
            <div className="publishwrap nostick">
              <button
                className="btn si"
                disabled={pending || !sgEmail.trim() || !sgRelation}
                onClick={sendClaim}
              >
                {pending ? "Sending…" : "Ask to own this page"}
              </button>
            </div>
          </div>
        </div>
      )}
      {mode === "optout" && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <div className="sheet">
            <button className="iconbtn sheetclose" aria-label="Close" onClick={onClose}>
              <Icon name="close" size={16} />
            </button>
            <h2>Take this page down</h2>
            <p className="lead">
              This page exists because a coach who teaches here added it. That is not the
              same as you wanting it here. If you run this studio and would rather not be
              listed, tell us and we&rsquo;ll take it down; nobody is kept on fittlist.
            </p>
            <label className="flabel" htmlFor="ooName">Your name</label>
            <input
              id="ooName"
              className="editinput"
              type="text"
              autoComplete="name"
              placeholder="e.g. Jenny Ramos"
              value={sgName}
              onChange={(e) => setSgName(e.target.value)}
            />
            <label className="flabel" htmlFor="ooEmail">Your email</label>
            <input
              id="ooEmail"
              className="editinput"
              type="email"
              autoCapitalize="none"
              autoComplete="email"
              placeholder="you@example.com"
              value={sgEmail}
              onChange={(e) => setSgEmail(e.target.value)}
            />
            <label className="flabel">Your connection to it</label>
            <div className="relpick">
              {OPTOUT_RELATIONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`relchip${sgRelation === r ? " sel" : ""}`}
                  onClick={() => setSgRelation(sgRelation === r ? "" : r)}
                >
                  {r}
                </button>
              ))}
            </div>
            <label className="flabel" htmlFor="ooMsg">
              Anything we should know <span>· optional</span>
            </label>
            <textarea
              id="ooMsg"
              className="editinput"
              rows={2}
              maxLength={1000}
              placeholder="e.g. We'd rather keep our schedule on our own site."
              value={sgMessage}
              onChange={(e) => setSgMessage(e.target.value)}
            />
            <div className="publishwrap nostick">
              <button
                className="btn si"
                disabled={pending || !sgEmail.trim() || !sgRelation}
                onClick={sendOptout}
              >
                {pending ? "Sending…" : "Ask us to take it down"}
              </button>
            </div>
          </div>
        </div>
      )}
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}

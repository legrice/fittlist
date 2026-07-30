"use client";

import { useState, useTransition } from "react";
import { reportStudio, suggestStudioEdit } from "@/app/actions/studios";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";

// The two quiet doors at the bottom of a studio page. Suggest an edit is for
// anyone, signed in or not: the person most worth hearing from is the owner,
// who probably has no account, and the relation field is what turns a
// correction into a lead. Report is the moderation door, signed-in only, same
// shape as reporting a class.

const REASONS = [
  "It closed",
  "Wrong address",
  "Duplicate of another studio",
  "Not a real place",
  "Something else",
];

const RELATIONS = ["I own it", "I manage it", "I coach here", "I train here", "Other"];

export function StudioFeedback({ studioId, signedIn }: { studioId: string; signedIn: boolean }) {
  const [mode, setMode] = useState<null | "report" | "suggest">(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [sgName, setSgName] = useState("");
  const [sgEmail, setSgEmail] = useState("");
  const [sgRelation, setSgRelation] = useState("");
  const [sgMessage, setSgMessage] = useState("");
  const [reportDone, setReportDone] = useState(false);
  const [suggestDone, setSuggestDone] = useState(false);
  const [pending, start] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();

  const sendReport = () =>
    start(async () => {
      const res = await reportStudio(studioId, reason, note);
      if (!res.ok) {
        toast(res.error ?? "Couldn't send that.");
        return;
      }
      setMode(null);
      setReportDone(true);
    });

  const sendSuggestion = () =>
    start(async () => {
      const res = await suggestStudioEdit(studioId, sgName, sgEmail, sgRelation, sgMessage);
      if (!res.ok) {
        toast(res.error ?? "Couldn't send that.");
        return;
      }
      setMode(null);
      setSuggestDone(true);
    });

  return (
    <>
      <div className="studiofeedback">
        {suggestDone ? (
          <p className="classsheet-reported">Thanks. We&rsquo;ll take a look.</p>
        ) : (
          <button className="classsheet-report" onClick={() => setMode("suggest")}>
            Suggest an edit
          </button>
        )}
        {signedIn &&
          (reportDone ? (
            <p className="classsheet-reported">Thanks. We&rsquo;ll take a look.</p>
          ) : (
            <button className="classsheet-report" onClick={() => setMode("report")}>
              Report this studio
            </button>
          ))}
      </div>

      {mode === "report" && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) setMode(null);
          }}
        >
          <div className="sheet confirmsheet">
            <button className="iconbtn sheetclose" aria-label="Close" onClick={() => setMode(null)}>
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
            if (e.target === e.currentTarget) setMode(null);
          }}
        >
          <div className="sheet">
            <button className="iconbtn sheetclose" aria-label="Close" onClick={() => setMode(null)}>
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
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}

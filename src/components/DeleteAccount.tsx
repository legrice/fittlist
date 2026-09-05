"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteMyAccount } from "@/app/actions/auth";
import { Icon } from "@/components/Icon";
import { clearClientMemory } from "@/lib/client-memory";

// The way out.
//
// It exists because both app stores require an account this app let somebody
// create to be deletable from inside it, and it belongs here anyway: an app
// whose whole argument is that nobody is the product should not make leaving
// an email you have to write.
//
// Two steps, and the second one asks for the word. This is the one action in
// the app with no undo: the classes, the marks, the follows and the messages
// all go, and a coach's public page stops answering. A single tap behind a
// red button is not enough for that, and a typed word is the cheapest way to
// be sure somebody meant it.
//
// It says what leaves before it asks, because a list of consequences after
// the fact is a list nobody read.
export function DeleteAccount({ isCoach = false }: { isCoach?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState("");
  const [err, setErr] = useState("");
  const [pending, start] = useTransition();

  const openConfirmation = () => {
    setWord("");
    setErr("");
    setOpen(true);
  };

  const closeConfirmation = () => {
    if (pending) return;
    setOpen(false);
    setWord("");
    setErr("");
  };

  const go = () => {
    if (word.trim().toLowerCase() !== "delete") return;
    start(async () => {
      const res = await deleteMyAccount();
      if (!res.ok) {
        setErr(res.error ?? "Couldn't delete that account.");
        return;
      }
      clearClientMemory();
      // The session is already gone server-side; this is just the way out of
      // a screen that no longer has anything behind it.
      router.replace("/");
      router.refresh();
    });
  };

  return (
    <>
      {/* A small link under the account settings rather than a row of its own.
          A full-width row with an icon and a chevron gives leaving the same
          weight as changing your password, and this is a door most people
          should never notice. It is still one tap from the section it
          belongs to, and the sheet behind it is where the seriousness
          lives. */}
      <button className="dellink" onClick={openConfirmation}>
        Delete account
      </button>

      {open && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeConfirmation();
          }}
        >
          <div className="sheet confirmsheet">
            <button
              className="iconbtn sheetclose sheet-dismiss"
              aria-label="Close"
              onClick={closeConfirmation}
            >
              <Icon name="close" size={20} />
            </button>
            <h2>Are you sure you want to delete your account?</h2>
            <p className="lead">
              This is permanent and cannot be undone. Everything below goes at once, and nothing
              about it can be brought back.
            </p>
            <ul className="dellist">
              <li>Your profile, your photo and your handle. The link stops working.</li>
              {isCoach && <li>Every class you publish, and the page people visit to see them.</li>}
              <li>Your own calendar entries and the classes you added.</li>
              <li>Who you follow, and who follows you.</li>
              <li>Your messages, and the notifications you have not read.</li>
            </ul>
            <p className="lead">
              If a studio has you on its rota, those shifts open back up for somebody else rather
              than disappearing.
            </p>
            <label className="flabel" htmlFor="delWord">
              Type <strong>delete</strong> to confirm
            </label>
            <input
              id="delWord"
              className="editinput"
              autoCapitalize="none"
              autoCorrect="off"
              value={word}
              onChange={(e) => {
                setWord(e.target.value);
                setErr("");
              }}
              aria-label="Type delete to confirm"
            />
            {err && <p className="errorcopy">{err}</p>}
            <div className="publishwrap">
              <button
                className="btn si"
                disabled={pending || word.trim().toLowerCase() !== "delete"}
                onClick={go}
              >
                {pending ? "Deleting…" : "Delete my account"}
              </button>
              <button
                className="tertiary"
                style={{ marginTop: 10 }}
                disabled={pending}
                onClick={closeConfirmation}
              >
                Keep my account
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

"use client";

import { useState, useTransition } from "react";
import { setGoing, setGoingCompanions } from "@/app/actions/going";
import { CompanionsEditor } from "@/components/CompanionsEditor";
import { TellSheet } from "@/components/TellSheet";
import { Icon } from "@/components/Icon";

// "I'm going" on the class itself, pinned to the bottom of the screen — the
// one commitment the page asks for. A personal note, never a reservation, so
// on a class with a booking link the caption says so plainly.
export function GoingButton({
  classId,
  iso,
  initialGoing,
  hasBooking,
  className,
  dateLong,
  shareUrl,
  initialCompanions = [],
  myHandle = null,
}: {
  classId: string;
  iso: string;
  initialGoing: boolean;
  hasBooking: boolean;
  /** For the invitation the share carries once you're going. */
  className: string;
  dateLong: string;
  shareUrl: string;
  initialCompanions?: string[];
  myHandle?: string | null;
}) {
  const [on, setOn] = useState(initialGoing);
  const [err, setErr] = useState("");
  const [tellOpen, setTellOpen] = useState(false);
  const [toldMsg, setToldMsg] = useState("");
  const [pending, startTransition] = useTransition();
  const url = myHandle ? `${shareUrl}&g=${myHandle}` : shareUrl;

  // The moment you commit is the moment you'd text a friend.
  const invite = async () => {
    const text = `I'm going to ${className} on ${dateLong}. Come with me:`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: className, text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
      setErr("");
    } catch {
      // a dismissed share sheet is not an error
    }
  };

  const toggle = () => {
    const next = !on;
    setOn(next);
    setErr("");
    startTransition(async () => {
      const res = await setGoing(classId, iso, next);
      if (!res.ok) {
        setOn(!next);
        setErr(res.error ?? "Something went wrong.");
        return;
      }
      if (next) setTellOpen(true);
    });
  };

  return (
    <div className="evcta">
      <div className="evcta-inner">
        <p className="evctanote">
          {hasBooking
            ? "Just for your own week. Book above to reserve your spot."
            : "Just for your own week. It isn't a booking."}
        </p>
        <button
          className={`btn evctabtn${on ? " on" : ""}`}
          disabled={pending}
          aria-pressed={on}
          onClick={toggle}
        >
          <Icon name={on ? "check" : "add"} size={18} />
          {on ? "Added to your week" : "Add to your week"}
        </button>
        {on && (
          <button className="invitebtn" onClick={invite}>
            <Icon name="campaign" size={17} /> Tell someone you&rsquo;re going
          </button>
        )}
        {on && (
          <CompanionsEditor
            value={initialCompanions}
            onSave={async (names) => {
              const res = await setGoingCompanions(classId, iso, names);
              return res.ok ? (res.companions ?? []) : null;
            }}
          />
        )}
        {err && <p className="err">{err}</p>}
        {toldMsg && <p className="evctanote">{toldMsg}</p>}
      </div>
      <TellSheet
        open={tellOpen}
        onClose={() => setTellOpen(false)}
        name={className}
        dateLong={dateLong}
        shareUrl={url}
        classId={classId}
        whenIso={iso}
        onToast={setToldMsg}
      />
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setEventCompanions, setEventGoing } from "@/app/actions/events";
import { CompanionsEditor } from "@/components/CompanionsEditor";
import { Icon } from "@/components/Icon";

// "I'm going", for an event. Same meaning as the class mark: a personal note
// and a wave to your mutuals, never a reservation. The refresh after a change
// is what reveals (or hides) the who's-going list, since seeing it is priced
// at being on it.
export function EventGoingButton({
  id,
  initialGoing,
  eventName,
  whenLabel,
  shareUrl,
  initialCompanions = [],
  myHandle = null,
}: {
  id: string;
  initialGoing: boolean;
  /** For the invitation the share carries once you're going. */
  eventName: string;
  whenLabel: string;
  shareUrl: string;
  initialCompanions?: string[];
  myHandle?: string | null;
}) {
  const router = useRouter();
  const [going, setGoing] = useState(initialGoing);
  const [pending, start] = useTransition();
  const toggle = () =>
    start(async () => {
      const res = await setEventGoing(id, !going);
      if (res.ok) {
        setGoing(!going);
        router.refresh();
      }
    });
  // The moment you commit is the moment you'd text a friend.
  const invite = async () => {
    const text = `I'm going to ${eventName} on ${whenLabel}. Come with me:`;
    const url = myHandle ? `${shareUrl}?g=${myHandle}` : shareUrl;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: eventName, text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
    } catch {
      // a dismissed share sheet is not an error
    }
  };
  return (
    <>
      <button
        className={`classsheet-add evgoing${going ? " on" : ""}`}
        disabled={pending}
        aria-pressed={going}
        onClick={toggle}
      >
        <Icon name={going ? "check" : "add"} size={18} />
        {going ? "You're going" : "I'm going"}
      </button>
      {going && (
        <button className="invitebtn" onClick={invite}>
          <Icon name="campaign" size={17} /> Tell someone you&rsquo;re going
        </button>
      )}
      {going && (
        <CompanionsEditor
          value={initialCompanions}
          onSave={async (names) => {
            const res = await setEventCompanions(id, names);
            if (res.ok) router.refresh();
            return res.ok ? (res.companions ?? []) : null;
          }}
        />
      )}
    </>
  );
}

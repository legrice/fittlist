"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setEventCompanions, setEventGoing } from "@/app/actions/events";
import { CompanionsEditor } from "@/components/CompanionsEditor";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";

// The event page's two actions, worn the way the profile photo overlay wears
// its own: a pair of circles with room around them and words underneath.
// Going is a personal note and a wave to your mutuals, never a reservation;
// Share hands the event on, and once you're going it carries the invitation
// and the poster with your name on it. Anything louder belongs to the tickets
// pill below, which is the event's own door.
export function EventPageActions({
  id,
  canGo,
  initialGoing,
  eventName,
  whenLabel,
  shareUrl,
  initialCompanions = [],
  myHandle = null,
  othersCount = null,
}: {
  id: string;
  /** Signed in and not the poster: the only viewer with a mark to make. */
  canGo: boolean;
  initialGoing: boolean;
  eventName: string;
  whenLabel: string;
  shareUrl: string;
  initialCompanions?: string[];
  myHandle?: string | null;
  /** How many other people this going viewer may see. null = not going. */
  othersCount?: number | null;
}) {
  const router = useRouter();
  const [going, setGoing] = useState(initialGoing);
  const [pending, start] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();

  const toggle = () =>
    start(async () => {
      const res = await setEventGoing(id, !going);
      if (res.ok) {
        setGoing(!going);
        router.refresh();
      }
    });

  // The moment you commit is the moment you'd text a friend, so once you're
  // going the share carries the sentence and the ?g= poster, not just a link.
  const share = async () => {
    const text = going ? `I'm going to ${eventName} on ${whenLabel}. Come with me:` : null;
    const url = going && myHandle ? `${shareUrl}?g=${myHandle}` : shareUrl;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share(text ? { title: eventName, text, url } : { title: eventName, url });
        return;
      }
      await navigator.clipboard.writeText(text ? `${text} ${url}` : url);
      toast(text ? "Invite copied, ready to paste" : "Link copied, ready to paste");
    } catch {
      // a dismissed share sheet is not an error
    }
  };

  return (
    <>
      <div className="evacts">
        {canGo && (
          <button className="avact" disabled={pending} aria-pressed={going} onClick={toggle}>
            <span className={`avact-ic${going ? " on" : ""}`}>
              <Icon name={going ? "check" : "add"} size={22} />
            </span>
            {going ? "Going" : "I'm going"}
          </button>
        )}
        <button className="avact" onClick={share}>
          <span className="avact-ic">
            <Icon name="ios_share" size={22} />
          </span>
          Share
        </button>
      </div>
      {/* Names, not accounts: Joanne doesn't need the app to count. Quiet on
          purpose, and only once there's a mark for the names to ride on. */}
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
      {/* An empty room is an invitation, not a verdict: the share leans in
          exactly when it would help. */}
      {going && othersCount === 0 && (
        <div className="emptyroom">
          <h3 className="classsheet-roster-h">Also going</h3>
          <p className="emptyroom-p">
            No one else yet. Fitness is better together, so bring somebody.
          </p>
          <button className="emptyroom-btn" onClick={share}>
            <Icon name="campaign" size={17} /> Share with friends
          </button>
        </div>
      )}
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}

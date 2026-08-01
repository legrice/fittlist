"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setEventCompanions, setEventGoing } from "@/app/actions/events";
import { CompanionsEditor } from "@/components/CompanionsEditor";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";

// The event page's actions, identical to the overlay's: Book and the heart
// on a dark pill at the bottom. Going is a personal note and a wave to your
// mutuals, never a reservation; the share lives in the empty room, at the
// moment it would actually help.
export function EventPageActions({
  id,
  canGo,
  initialGoing,
  eventName,
  whenLabel,
  shareUrl,
  link = null,
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
  /** Tickets or details: the event's own door, the pill's Book side. */
  link?: string | null;
  initialCompanions?: string[];
  myHandle?: string | null;
  /** How many other people this going viewer may see. null = not going. */
  othersCount?: number | null;
}) {
  const router = useRouter();
  const [going, setGoing] = useState(initialGoing);
  const [pending, start] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();
  const [favOn, setFavOn] = useState(false);
  const favTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toggle = () =>
    start(async () => {
      const res = await setEventGoing(id, !going);
      if (!res.ok) return;
      const next = !going;
      setGoing(next);
      if (next) {
        setFavOn(true);
        if (favTimer.current) clearTimeout(favTimer.current);
        favTimer.current = setTimeout(() => setFavOn(false), 4200);
      } else {
        setFavOn(false);
      }
      router.refresh();
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
      {/* Names, not accounts: Joanne doesn't need the app to count. */}
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
      {(link || canGo) && (
        <div className="classoverlay-cta">
          {link && (
            <a className="ovcta-btn" href={link} target="_blank" rel="noopener nofollow">
              Book
            </a>
          )}
          {link && canGo && <span className="ovcta-div" aria-hidden="true" />}
          {canGo && (
            <button
              className={`ovcta-btn ovcta-save${going ? " on" : ""}`}
              disabled={pending}
              aria-pressed={going}
              aria-label={going ? "Going" : "I'm going"}
              onClick={toggle}
            >
              <Icon name="favorite" size={19} />
              {!going && "I'm going"}
            </button>
          )}
        </div>
      )}
      {/* The note that answers the heart: an event mark means you're going. */}
      <div className={`favtoast${favOn ? " on" : ""}`} aria-hidden={!favOn}>
        <Icon name="favorite" size={16} className="favtoast-heart" />
        You&rsquo;re going
      </div>
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { eventDetail, setEventCompanions, setEventGoing, type EventDetail } from "@/app/actions/events";
import { CompanionsEditor } from "@/components/CompanionsEditor";
import { EventRemoveButton } from "@/components/EventRemoveButton";
import { Icon } from "@/components/Icon";
import { Roster } from "@/components/Roster";
import { Toast, useToast } from "@/components/Toast";

// An event, worn exactly the way a class is: the board stays visible through
// a light blur, floating circles top left and right (back, the dots), the
// event in open space, and the two things to do on a dark pill at the bottom:
// Book, and the heart. The page at /e/{id} stays for links.
export function EventSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const [ev, setEv] = useState<EventDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [going, setGoing] = useState(false);
  const [pending, start] = useTransition();
  const [toastMsg, toastOn, toast] = useToast();
  const [moreOpen, setMoreOpen] = useState(false);
  const [favOn, setFavOn] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const favTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let live = true;
    eventDetail(id).then((d) => {
      if (!live) return;
      if (!d) {
        setMissing(true);
        return;
      }
      setEv(d);
      setGoing(d.going);
    });
    return () => {
      live = false;
    };
  }, [id]);

  useEffect(() => {
    if (!moreOpen) return;
    const onDown = (e: PointerEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [moreOpen]);

  const toggle = () => {
    if (!ev || pending) return;
    const next = !going;
    setGoing(next);
    start(async () => {
      const res = await setEventGoing(ev.id, next);
      if (!res.ok) {
        setGoing(!next);
        toast(res.error ?? "Something went wrong");
        return;
      }
      if (next) {
        setFavOn(true);
        if (favTimer.current) clearTimeout(favTimer.current);
        favTimer.current = setTimeout(() => setFavOn(false), 4200);
      } else {
        setFavOn(false);
      }
      // Refresh the room: the server decides who this viewer may see, and a
      // fresh mark changes the answer.
      const fresh = await eventDetail(id);
      if (fresh) setEv(fresh);
    });
  };

  // The share lives in the empty room only, and once you're going it carries
  // the invitation and the poster with your name on it.
  const share = async () => {
    if (!ev) return;
    const text = going ? `I'm going to ${ev.name} on ${ev.startLabel}. Come with me:` : null;
    const url = going && ev.myHandle ? `${ev.shareUrl}?g=${ev.myHandle}` : ev.shareUrl;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share(text ? { title: ev.name, text, url } : { title: ev.name, url });
        return;
      }
      await navigator.clipboard.writeText(text ? `${text} ${url}` : url);
      toast(text ? "Invite copied, ready to paste" : "Link copied, ready to paste");
    } catch {
      // a dismissed share sheet is not an error
    }
  };

  return (
    <div className="classoverlay">
      <button className="ovcircle ovcircle-back" aria-label="Back" onClick={onClose}>
        <Icon name="arrow_back" size={19} />
      </button>
      {ev && (
        <div ref={moreRef}>
          <button
            className="ovcircle ovcircle-more"
            aria-label="More"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((o) => !o)}
          >
            <Icon name="more_horiz" size={18} />
          </button>
          {moreOpen && (
            <div className="ovmenu" role="menu">
              <a
                className="ovmenu-item"
                role="menuitem"
                href={ev.googleUrl}
                target="_blank"
                rel="noopener nofollow"
                onClick={() => setMoreOpen(false)}
              >
                <Icon name="calendar_month" size={17} /> Add to Google Calendar
              </a>
            </div>
          )}
        </div>
      )}

      {missing ? (
        <div className="classoverlay-body">
          <p className="lead" style={{ textAlign: "center", marginTop: "30vh" }}>
            That event isn&rsquo;t there any more.
          </p>
        </div>
      ) : !ev ? (
        <div className="classoverlay-body" aria-hidden="true" />
      ) : (
        <div className="classoverlay-body">
          {ev.photo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="evsheet-hero" src={ev.photo} alt={ev.name} />
          )}
          <h2 className="classoverlay-nm">{ev.name}</h2>
          {ev.host &&
            (ev.posterHandle ? (
              <Link className="classoverlay-coach" href={`/${ev.posterHandle}`}>
                <span className="classoverlay-coach-txt">
                  <span className="k">Hosted by</span> {ev.host}
                </span>
                <Icon name="chevron_right" size={16} />
              </Link>
            ) : (
              <p className="classoverlay-coach">
                <span className="classoverlay-coach-txt">
                  <span className="k">Hosted by</span> {ev.host}
                </span>
              </p>
            ))}

          <div className="evfacts classoverlay-facts">
            <div className="evfact">
              <Icon name="event" size={20} />
              <span className="evfact-txt">
                <span className="t">{ev.whenLabel}</span>
              </span>
            </div>
            <div className="evfact">
              <Icon name="place" size={20} />
              <span className="evfact-txt">
                <span className="t">{ev.place}</span>
                {ev.city && <span className="s">{ev.city}</span>}
              </span>
            </div>
          </div>

          {ev.description?.trim() && <p className="evdesc classoverlay-desc">{ev.description}</p>}

          {ev.faces && ev.faces.length > 0 && (
            <div className="classsheet-roster">
              <h3 className="classsheet-roster-h">
                {ev.isPoster ? "Going" : "Also going"} · {ev.faces.length}
              </h3>
              <Roster people={ev.faces} />
            </div>
          )}
          {/* An empty room is an invitation, not a verdict: the one place the
              share lives, for the goer and for the poster alike. */}
          {ev.faces && ev.faces.length === 0 && (
            <div className="emptyroom">
              <h3 className="classsheet-roster-h">{ev.isPoster ? "Going" : "Also going"}</h3>
              <p className="emptyroom-p">
                No one else yet. Fitness is better together, so bring somebody.
              </p>
              <button className="emptyroom-btn" onClick={share}>
                <Icon name="campaign" size={17} /> Share with friends
              </button>
            </div>
          )}

          {/* Names, not accounts: Joanne doesn't need the app to count. */}
          {going && (
            <CompanionsEditor
              value={ev.myCompanions}
              onSave={async (names) => {
                const res = await setEventCompanions(ev.id, names);
                if (!res.ok) {
                  toast(res.error ?? "Something went wrong");
                  return null;
                }
                return res.companions ?? [];
              }}
            />
          )}

          {ev.canRemove && <EventRemoveButton id={ev.id} onDone={onClose} />}
        </div>
      )}

      {ev && (ev.link || ev.canGo) && (
        <div className="classoverlay-cta">
          {ev.link && (
            <a className="ovcta-btn" href={ev.link} target="_blank" rel="noopener nofollow">
              Book
            </a>
          )}
          {ev.link && ev.canGo && <span className="ovcta-div" aria-hidden="true" />}
          {ev.canGo && (
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
    </div>
  );
}

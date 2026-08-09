"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { followTrainer, unfollowTrainer } from "@/app/actions/subscribe";
import { Icon } from "@/components/Icon";
import { MessageComposer } from "@/components/MessageComposer";
import { QrSheet } from "@/components/QrSheet";
import { ShareCardSheet } from "@/components/ShareCardSheet";
import { Toast, useToast } from "@/components/Toast";

// Tap a face, see the face. The avatar blows up over a blurred page with the
// things you'd want to do with a person under it: follow them, share or copy
// their link, and their QR code. Everything here is about the profile being
// looked at, never the viewer's own.
export function AvatarZoom({
  handle,
  name,
  photo,
  color,
  className,
  /** null hides the Follow action: the owner, or nobody signed in. */
  follow = null,
  isOwner = false,
  availability = null,
  canMessage = false,
  signedIn = false,
}: {
  handle: string;
  name: string;
  photo: string | null;
  color: string;
  /** The avatar's existing class on this page, so the trigger looks identical
   *  to the plain avatar it replaces. */
  className: string;
  follow?: { following: boolean; requested?: boolean } | null;
  /** The person looking is the person shown; the QR sheet says "Your". */
  isOwner?: boolean;
  /** Worn as a dot on the photo itself: green accepting, yellow waitlist.
   *  The words live in the overlay, under the photo. */
  availability?: string | null;
  /** Their messages are open and this isn't your own page; the status
   *  badge's explainer offers the composer when it's true. */
  canMessage?: boolean;
  signedIn?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [following, setFollowing] = useState(follow?.following ?? false);
  const [requested, setRequested] = useState(follow?.requested ?? false);
  const [availOpen, setAvailOpen] = useState(false);
  const [availWriting, setAvailWriting] = useState(false);
  const [availSent, setAvailSent] = useState(false);
  const [pending, start] = useTransition();
  const [mounted, setMounted] = useState(false);
  const [toastMsg, toastOn, toast] = useToast();
  useEffect(() => setMounted(true), []);

  const initial = (name.trim().charAt(0) || "?").toUpperCase();
  const first = name.trim().split(/\s+/)[0] || name;
  const url = () => `${window.location.origin}/${handle}`;

  const closeAvail = () => {
    setAvailOpen(false);
    setAvailWriting(false);
    setAvailSent(false);
  };

  const toggleFollow = () => {
    if (pending) return;
    start(async () => {
      if (following || requested) {
        const res = await unfollowTrainer(handle);
        if (!res.ok) {
          toast(res.error ?? "Something went wrong.");
          return;
        }
        setFollowing(false);
        setRequested(false);
      } else {
        const res = await followTrainer(handle);
        if (!res.ok) {
          toast(res.error ?? "Something went wrong.");
          return;
        }
        if (res.requested) setRequested(true);
        else setFollowing(true);
      }
      router.refresh();
    });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url());
      toast("Link copied");
    } catch {
      toast(url().replace(/^https?:\/\//, ""));
    }
  };

  const share = async () => {
    try {
      await navigator.share({ title: `${name} on fittlist`, url: url() });
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") copy();
    }
  };

  const face = photo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={className} src={photo} alt={name} />
  ) : (
    <span className={`${className} ${className}-empty`} style={{ background: color }} aria-hidden="true">
      {initial}
    </span>
  );

  return (
    <>
      <button
        type="button"
        className="avzoom-trigger"
        aria-label={`Open ${name}'s photo`}
        onClick={() => setOpen(true)}
      >
        {face}
        {availability && (
          <span
            className={`avphotodot avphotodot-${availability}`}
            aria-label={availability === "accepting" ? "Open for clients" : "Waitlist"}
            title={availability === "accepting" ? "Open for clients" : "Waitlist"}
          />
        )}
      </button>
      {open && mounted &&
        createPortal(
          <div
            className="avoverlay"
            role="dialog"
            aria-label={`${name}'s photo`}
            onClick={(e) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
          >
            {/* Tapping the backdrop closes too, but nothing says so; the X
                is the door people can see. */}
            <button
              className="iconbtn avoverlay-close"
              aria-label="Close"
              onClick={() => setOpen(false)}
            >
              <Icon name="close" size={20} />
            </button>
            <div className="avoverlay-top">
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="avoverlay-photo" src={photo} alt={name} />
              ) : (
                <span className="avoverlay-photo avoverlay-photo-empty" style={{ background: color }}>
                  {initial}
                </span>
              )}
              {/* The dot's words. The photo wears the colour; this says it.
                  A tap explains what the status means, because a badge nobody
                  can ask about is a claim taken on faith, and offers the
                  composer when their messages are open. */}
              {availability && (
                <button
                  className={`availbadge availbadge-${availability}`}
                  onClick={() => setAvailOpen(true)}
                  aria-label={
                    availability === "accepting"
                      ? "What Open for clients means"
                      : "What Waitlist means"
                  }
                >
                  <span className="availdot" aria-hidden="true" />
                  {availability === "accepting" ? "Open for clients" : "Waitlist"}
                </button>
              )}
            </div>
            <div className="avoverlay-bottom">
            <div className="avoverlay-acts">
              {follow && (
                <button className="avact" disabled={pending} onClick={toggleFollow}>
                  <span className={`avact-ic${following ? " on" : ""}`}>
                    <Icon name={following ? "check" : requested ? "schedule" : "person_add"} size={24} />
                  </span>
                  {following ? "Following" : requested ? "Requested" : "Follow"}
                </button>
              )}
              <button className="avact" onClick={share}>
                <span className="avact-ic">
                  <Icon name="ios_share" size={24} />
                </span>
                Share
              </button>
              <button className="avact" onClick={copy}>
                <span className="avact-ic">
                  <Icon name="link" size={24} />
                </span>
                Copy link
              </button>
              <button className="avact" onClick={() => setQrOpen(true)}>
                <span className="avact-ic">
                  <Icon name="qr_code_2" size={24} />
                </span>
                QR code
              </button>
              {/* Your own photo grows a fifth action: the square card image,
                  made for a post. Only yours; a card is a thing you hand out,
                  not something made of someone else. */}
              {isOwner && (
                <button className="avact" onClick={() => setCardOpen(true)}>
                  <span className="avact-ic">
                    <Icon name="auto_awesome" size={24} />
                  </span>
                  Card
                </button>
              )}
            </div>
            {/* No Message door here any more: Contact is the big pill on
                the page itself, with the sheet behind it. */}
            </div>
            {/* The badge's explainer. It reads like the Verified badge's
                sheet, and the Message door is the same composer the Contact
                pill opens: availability is the status, messaging is the act
                it invites. */}
            {availOpen && (
              <div
                className="sheet-scrim"
                onClick={(e) => {
                  if (e.target === e.currentTarget) closeAvail();
                }}
              >
                <div className={availWriting ? "sheet" : "sheet infosheet"}>
                  <button className="iconbtn sheetclose" aria-label="Close" onClick={closeAvail}>
                    <Icon name="close" size={18} />
                  </button>
                  {availWriting ? (
                    <>
                      {!availSent && <h2 style={{ marginTop: 10 }}>Message {first}</h2>}
                      <MessageComposer
                        handle={handle}
                        coachName={name}
                        signedIn={signedIn}
                        onDone={() => setAvailSent(true)}
                      />
                      {availSent && (
                        <div className="publishwrap">
                          <button className="btn si" onClick={closeAvail}>
                            Done
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <h2 style={{ marginTop: 10 }}>
                        {availability === "accepting" ? "Open for clients" : "Waitlist"}
                      </h2>
                      {availability === "accepting" ? (
                        <p className="lead">
                          The green dot means {first} is taking on new clients right now.
                        </p>
                      ) : (
                        <p className="lead">
                          The yellow dot means {first}&rsquo;s books are full right now, and
                          there is a waitlist for a spot.
                        </p>
                      )}
                      {canMessage && handle && (
                        <>
                          <p className="lead">
                            {availability === "accepting"
                              ? "Interested in training together? Say what you're looking for and it lands in their inbox."
                              : "You can still write and ask about the waitlist."}
                          </p>
                          <div className="publishwrap">
                            <button className="btn si" onClick={() => setAvailWriting(true)}>
                              Message {first}
                            </button>
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
            <QrSheet
              handle={handle}
              open={qrOpen}
              onClose={() => setQrOpen(false)}
              onToast={toast}
              ownerName={isOwner ? undefined : name}
            />
            {cardOpen && (
              <ShareCardSheet
                path={`/api/card/${handle}`}
                fileName={`fittlist-${handle}-card.png`}
                title="Share your profile"
                lead="A square card for a post or a story. The link on it goes to your page."
                alt="Your profile card"
                onClose={() => setCardOpen(false)}
                onToast={toast}
              />
            )}
          </div>,
          document.body,
        )}
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}

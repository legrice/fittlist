"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";
import { InstagramGlyph } from "@/components/InstagramGlyph";
import { MessageComposer } from "@/components/MessageComposer";

export type ContactWays = {
  email: string;
  phone: string;
  whatsapp: string;
  instagram: string;
  website: string;
  links: { label: string; url: string }[];
};

// One door for "how do I reach this person". It replaced the Contact tab: a
// tab is a section of a page you read, and this is a thing you do, so it
// belongs on the pill beside Follow rather than three taps into a page.
//
// fittlist is the top row on purpose. Every other way here hands the
// conversation to somebody else's app, where a coach loses the thread and a
// member loses the reply; a message sent here lands in their inbox on both
// sides. The rest are still offered, because a coach who put their number up
// meant it.
export function ContactSheet({
  handle,
  coachName,
  signedIn,
  canMessage,
  ways,
}: {
  handle: string;
  coachName: string;
  signedIn: boolean;
  /** Their messages are open and this isn't your own page. */
  canMessage: boolean;
  ways: ContactWays;
}) {
  const [open, setOpen] = useState(false);
  const [writing, setWriting] = useState(false);
  const [sent, setSent] = useState(false);
  const [mounted, setMounted] = useState(false);
  const first = coachName.trim().split(/\s+/)[0] || coachName;

  useEffect(() => setMounted(true), []);

  const close = () => {
    setOpen(false);
    setWriting(false);
    setSent(false);
  };

  return (
    <>
      <button
        className="actpill actpill-primary"
        onClick={() => {
          setWriting(false);
          setSent(false);
          setOpen(true);
        }}
      >
        <Icon name="chat_bubble" size={17} /> Contact
      </button>

      {/* Portalled to the body. The pill lives inside the hero, which is a
          positioned layer under the z-45 tab bar: a sheet rendered in place
          comes up behind the bar with its bottom row unreachable. */}
      {open &&
        mounted &&
        createPortal(
          <div
            className="sheet-scrim"
            onClick={(e) => {
              if (e.target === e.currentTarget) close();
            }}
          >
            <div className="sheet">
              <button className="iconbtn sheetclose" aria-label="Close" onClick={close}>
                <Icon name="close" size={16} />
              </button>
              {writing ? (
                <>
                  {!sent && <h2 style={{ marginTop: 10 }}>Message {first}</h2>}
                  <MessageComposer
                    handle={handle}
                    coachName={coachName}
                    signedIn={signedIn}
                    onDone={() => setSent(true)}
                  />
                  {sent && (
                    <div className="publishwrap">
                      <button className="btn si" onClick={close}>
                        Done
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <h2 style={{ marginTop: 10 }}>Contact {first}</h2>
                  <div className="contactlist">
                    {canMessage && (
                      <button className="proflink proflink-first" onClick={() => setWriting(true)}>
                        <Icon name="chat_bubble" size={18} /> Message on fittlist
                      </button>
                    )}
                    {ways.email && (
                      <a className="proflink" href={`mailto:${ways.email}`}>
                        <Icon name="mail" size={18} /> Email
                      </a>
                    )}
                    {ways.phone && (
                      <a className="proflink" href={`tel:${ways.phone.replace(/[^\d+]/g, "")}`}>
                        <Icon name="call" size={18} /> Call
                      </a>
                    )}
                    {ways.whatsapp && (
                      <a
                        className="proflink"
                        href={`https://wa.me/${ways.whatsapp.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noopener nofollow"
                      >
                        <Icon name="chat" size={18} /> WhatsApp
                      </a>
                    )}
                    {ways.instagram && (
                      <a
                        className="proflink"
                        href={`https://instagram.com/${ways.instagram}`}
                        target="_blank"
                        rel="noopener nofollow"
                      >
                        <InstagramGlyph /> Instagram
                      </a>
                    )}
                    {ways.website && (
                      <a
                        className="proflink"
                        href={ways.website}
                        target="_blank"
                        rel="noopener nofollow"
                      >
                        <Icon name="public" size={18} /> Website
                      </a>
                    )}
                    {ways.links.map((l, i) => (
                      <a
                        key={i}
                        className="proflink"
                        href={l.url}
                        target="_blank"
                        rel="noopener nofollow"
                      >
                        <Icon name="link" size={18} /> {l.label}
                      </a>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

"use client";

import { useEffect, useState, useTransition } from "react";
import {
  personalDetail,
  removePersonalClass,
  type PersonalDetail,
} from "@/app/actions/personal";
import { Icon } from "@/components/Icon";
import { ShareCardSheet } from "@/components/ShareCardSheet";
import { fmtDateLong } from "@/lib/format";

// One of your own entries, opened.
//
// It used to do nothing at all: a row in Your plans with no page behind it and
// no way in, so a class somebody had typed out in full was a line of grey text
// they could only delete. It wears the class overlay rather than a sheet of
// its own, because from the list it is the same gesture on the same kind of
// row, and the two ought to feel alike.
//
// Two things to do with it, on the same floating pill a public class carries:
// change it, and hand it on as a picture. The picture is the only thing that
// can leave, and it leaves as a file rather than a link: there is no page for
// this and there is not going to be one.
//
// And a third thing, at the foot: taking it off. This is the only door to that
// on a coach's calendar, and it belongs here rather than in the editor for the
// reason the sheet exists at all: both calendars already open it for a personal
// row, so one remove here is a remove on both. The member's X on their own week
// is a shortcut to the same act, not the only way to it.
export function PlanSheet({
  id,
  share = false,
  onClose,
  onEdit,
  onRemoved,
  onToast,
}: {
  id: string;
  /** Open straight onto the card. The note after a save offers the picture,
   *  and landing on the sheet to tap Share again would be a step for nothing. */
  share?: boolean;
  onClose: () => void;
  /** Opens the adder on this entry. The list owns the form, so it owns this. */
  onEdit: (p: PersonalDetail) => void;
  /** The row is gone. The list owns the refresh, the same way it does an edit. */
  onRemoved: (msg: string) => void;
  onToast: (msg: string) => void;
}) {
  const [p, setP] = useState<PersonalDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [cardOpen, setCardOpen] = useState(share);
  const [confirm, setConfirm] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let live = true;
    personalDetail(id).then((res) => {
      if (!live) return;
      if (res) setP(res);
      else setMissing(true);
    });
    return () => {
      live = false;
    };
  }, [id]);

  const where = p?.studioName || p?.location || "";

  const doRemove = () => {
    startTransition(async () => {
      const res = await removePersonalClass(id);
      if (!res.ok) {
        onToast(res.error ?? "Couldn't remove that");
        return;
      }
      onRemoved("Removed from your calendar");
    });
  };

  return (
    <div className="classoverlay">
      <button className="ovcircle ovcircle-back" aria-label="Back" onClick={onClose}>
        <Icon name="arrow_back" size={21} />
      </button>

      {/* Scrolls inside, like the class overlay: the overlay's blur makes it
          the containing block for fixed children, so the scroll has to live a
          layer in for the pill to stay put. */}
      <div className="classoverlay-scroll">
      {missing ? (
        <div className="classoverlay-body">
          <p className="lead" style={{ textAlign: "center", marginTop: "30vh" }}>
            That class isn&rsquo;t there any more.
          </p>
        </div>
      ) : !p ? (
        <div className="classoverlay-body" aria-hidden="true" />
      ) : (
        <div className="classoverlay-body">
          {p.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="classoverlay-img" src={p.image} alt="" />
          )}
          {p.classType && <span className="evtype classoverlay-type">{p.classType}</span>}
          <h2 className="classoverlay-nm">{p.name}</h2>
          {/* No coach row to tap through to: the person named here is a name
              somebody typed, not an account. */}
          {p.withWho.trim() && <p className="plansheet-who">with {p.withWho}</p>}

          <div className="evfacts classoverlay-facts">
            <div className="evfact">
              <Icon name="event" size={22} />
              <span className="evfact-txt">
                <span className="t">
                  {p.nextIso ? fmtDateLong(p.nextIso) : `${p.dayLabel}s`}
                </span>
                <span className="s">
                  {p.hm}
                  <span className="ps-ap">{p.ap}</span> · {p.durationMin} min
                  {p.specificDate ? "" : " · every week"}
                </span>
              </span>
            </div>
            {where && (
              <div className="evfact">
                <Icon name="place" size={22} />
                <span className="evfact-txt">
                  <span className="t">{where}</span>
                </span>
              </div>
            )}
          </div>

          {p.description?.trim() && (
            <>
              <h3 className="ovsec-h">About</h3>
              <p className="evdesc classoverlay-desc">{p.description}</p>
            </>
          )}

          {p.links.length > 0 && (
            <>
              <h3 className="ovsec-h">Booking</h3>
              <div className="bookout-links">
                {p.links.map((l, i) => (
                  <a
                    key={i}
                    className="btn si evbtn"
                    href={l.url}
                    target="_blank"
                    rel="noopener nofollow"
                  >
                    Book via {l.label}
                    <Icon name="north_east" size={20} className="evbtn-ico" />
                  </a>
                ))}
              </div>
            </>
          )}

          {/* Said plainly, because it is the thing people ask about a list
              that looks like a schedule. */}
          <p className="plansheet-note">
            Yours alone. Nothing here is on a public page, and nobody else can see it.
          </p>

          {/* The small orange link the class editor's own delete wears. A
              Going mark comes back from the coach's page, so that one takes
              Undo in a toast; this row was typed by hand and nothing brings it
              back, which is what earns the question. */}
          <div className="dangerzone">
            <button className="deletelink" onClick={() => setConfirm(true)}>
              Remove from your calendar
            </button>
          </div>
        </div>
      )}
      </div>

      {p && (
        <div className="classoverlay-cta">
          <button className="ovcta-btn" onClick={() => onEdit(p)}>
            <Icon name="edit" size={19} /> Edit
          </button>
          <span className="ovcta-div" aria-hidden="true" />
          <button className="ovcta-btn" onClick={() => setCardOpen(true)}>
            <Icon name="auto_awesome" size={19} /> Share
          </button>
        </div>
      )}

      {confirm && p && (
        <div
          className="sheet-scrim"
          onClick={(e) => {
            if (e.target === e.currentTarget && !pending) setConfirm(false);
          }}
        >
          <div className="sheet confirmsheet">
            <h3>Remove {p.name}?</h3>
            <p className="lead">
              {p.specificDate
                ? "It comes off your calendar."
                : "It comes off your calendar, every week it runs."}{" "}
              You typed this one, so adding it back means typing it again.
            </p>
            <div className="publishwrap nostick">
              <button className="btn si" disabled={pending} onClick={doRemove}>
                {pending ? "Removing…" : "Remove it"}
              </button>
            </div>
            <button className="confirm-keep" disabled={pending} onClick={() => setConfirm(false)}>
              Keep it
            </button>
          </div>
        </div>
      )}

      {cardOpen && p && (
        <ShareCardSheet
          path={`/api/card/plan/${p.id}`}
          fileName={`fittlist-${p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`}
          title="Share this class"
          lead="A square picture of the class, made for you. The class itself stays private: this hands over an image, not a link."
          alt={`${p.name} card`}
          onClose={() => setCardOpen(false)}
          onToast={onToast}
        />
      )}
    </div>
  );
}

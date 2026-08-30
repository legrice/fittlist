"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  personalDetail,
  removePersonalClass,
  type PersonalDetail,
} from "@/app/actions/personal";
import { Icon } from "@/components/Icon";
import { ShareCardSheet } from "@/components/ShareCardSheet";
import { fmtDateLong } from "@/lib/format";
import {
  invalidateClientMemory,
  loadClientMemory,
  readClientMemory,
} from "@/lib/client-memory";

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
  const memoryKey = `personal-detail:${id}`;
  const remembered = readClientMemory<PersonalDetail>(memoryKey) ?? null;
  const [loaded, setLoaded] = useState<PersonalDetail | null>(() => remembered);
  // If React reuses this sheet for another row, never paint the previous
  // entry for the one frame before its effect runs.
  const p = loaded?.id === id ? loaded : remembered;
  const [missingId, setMissingId] = useState<string | null>(null);
  const missing = missingId === id;
  const [cardOpen, setCardOpen] = useState(share);
  const [confirm, setConfirm] = useState(false);
  const [pending, startTransition] = useTransition();
  const detailRequest = useRef(0);

  useEffect(() => {
    const key = `personal-detail:${id}`;
    const cached = readClientMemory<PersonalDetail>(key) ?? null;
    setLoaded(cached);
    setMissingId(null);
    const request = ++detailRequest.current;
    let live = true;
    void loadClientMemory<PersonalDetail | null>(key, () => personalDetail(id))
      .then((res) => {
        if (!live || request !== detailRequest.current) return;
        if (res) {
          setLoaded(res);
          setMissingId(null);
        } else {
          invalidateClientMemory(key);
          setLoaded(null);
          setMissingId(id);
        }
      })
      // A quiet refresh should not replace a remembered entry with an error.
      .catch(() => {});
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
      detailRequest.current += 1;
      invalidateClientMemory(memoryKey);
      onRemoved("Removed from your week");
    });
  };

  return (
    <div className="sheet-scrim" onClick={(e) => { if (e.target === e.currentTarget && !pending) onClose(); }}>
      <div className="sheet clspeek clsfull">
        <button className="clspeek-x clsfull-x" aria-label="Close" onClick={onClose}>
          <Icon name="close" size={20} />
        </button>
        {p?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="clsfull-photo" src={p.image} alt="" />
        ) : (
          <span className="clspeek-grab" aria-hidden="true" />
        )}

        {missing ? (
          <p className="lead" style={{ textAlign: "center", margin: "56px 0" }}>
            That class isn&rsquo;t there any more.
          </p>
        ) : p ? (
          <>
            {p.classType && <p className="clsfull-kick">{p.classType}</p>}
            <h2 className="clspeek-nm">{p.name}</h2>
            {p.withWho.trim() && <p className="plansheet-who">with {p.withWho}</p>}

            <div className="clsfull-facts">
              <div className="clsfull-fact">
                <span className="clsfull-ic"><Icon name="calendar_today" size={22} /></span>
                <span className="clsfull-txt">
                  <span className="t">{p.nextIso ? fmtDateLong(p.nextIso) : `${p.dayLabel}s`}</span>
                  <span className="s">
                    {p.hm}<span className="ps-ap">{p.ap}</span> · {p.durationMin} min
                    {p.specificDate ? "" : " · every week"}
                  </span>
                </span>
              </div>
              {where && (
                <div className="clsfull-fact">
                  <span className="clsfull-ic"><Icon name="place" size={22} /></span>
                  <span className="clsfull-txt"><span className="t">{where}</span></span>
                </div>
              )}
            </div>

            {p.description?.trim() && (
              <div className="clsfull-about">
                <h3>About</h3>
                <p>{p.description}</p>
              </div>
            )}

            <p className="plansheet-note">
              Yours alone. Nothing here is on a public page, and nobody else can see it.
            </p>
            <div className="clsfull-sections">
              {p.links.length > 0 && (
                <section className="clsfull-linksection">
                  <h3>Where to book</h3>
                  <div className="clsfull-linkrows">
                    {p.links.map((link) => (
                      <a key={link.url} href={link.url} target="_blank" rel="noopener nofollow">
                        <span>{link.label}</span>
                        <Icon name="north_east" size={19} />
                      </a>
                    ))}
                  </div>
                </section>
              )}
              <section className="clsfull-linksection">
                <h3>Share</h3>
                <button type="button" onClick={() => setCardOpen(true)}>
                  <span>Share this class</span>
                  <Icon name="reply" size={20} className="share-arrow-forward" />
                </button>
              </section>
            </div>
            <div className="clspeek-cta">
              <button className="clspeek-btn ghost" onClick={() => {
                // The editor owns the mutation callback, so drop this answer
                // before handing it over; the next open cannot replay the
                // pre-edit version even if the surrounding route stays put.
                invalidateClientMemory(memoryKey);
                onEdit(p);
              }}>Edit</button>
              <button className="clspeek-btn ghost" onClick={() => setConfirm(true)}>Remove</button>
            </div>
          </>
        ) : null}
      </div>

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
          noThemes={!!p.image}
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

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createEvent } from "@/app/actions/events";
import { Icon } from "@/components/Icon";

// The posting sheet for a community event: an expo, a competition, a meetup.
// Kept to what a flyer says: what, when, where, the flyer itself, and one
// link out to wherever tickets or details live. No ticketing here, ever.
export function EventComposer({
  open,
  myCity,
  onClose,
  onDone,
}: {
  open: boolean;
  myCity: string | null;
  onClose: () => void;
  /** Fires after a successful post; the toast belongs to the opener, because
   *  one rendered in here unmounts with the sheet and is never seen. */
  onDone: (msg: string) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [place, setPlace] = useState("");
  const [city, setCity] = useState(myCity ?? "");
  const [host, setHost] = useState("");
  const [link, setLink] = useState("");
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  // Resize the picked flyer to a small JPEG data URL, same as every other
  // photo in the app.
  const pickPhoto = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 900;
        let { width, height } = img;
        if (width > height && width > max) {
          height = (height * max) / width;
          width = max;
        } else if (height > max) {
          width = (width * max) / height;
          height = max;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d")?.drawImage(img, 0, 0, width, height);
        setPhoto(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const submit = () =>
    start(async () => {
      setError("");
      const res = await createEvent({
        name,
        startDate,
        endDate: endDate || null,
        startTime: startTime || null,
        place,
        city: city || null,
        photo,
        description: description || null,
        link: link || null,
        hostName: host || null,
      });
      if (!res.ok) {
        setError(res.error ?? "Something went wrong.");
        return;
      }
      onClose();
      onDone("Event posted");
      router.refresh();
    });

  if (!open) return null;
  return (
    <div
      className="sheet-scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet">
        <button className="iconbtn sheetclose" aria-label="Close" onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
        <h2 style={{ marginTop: 10 }}>Post an event</h2>
        <p className="lead">
          An expo, a competition, a meetup: something happening near you that people should
          know about. It lists under Events with your name on it.
        </p>

        <label className="flabel" htmlFor="evName">
          Name
        </label>
        <input
          id="evName"
          className="editinput"
          placeholder="e.g. Hudson Fit Expo"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <div className="evdates">
          <div>
            <label className="flabel" htmlFor="evStart">
              Date
            </label>
            <input
              id="evStart"
              type="date"
              className="editinput"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label className="flabel" htmlFor="evEnd">
              Ends <span>· if it runs longer</span>
            </label>
            <input
              id="evEnd"
              type="date"
              className="editinput"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>

        <label className="flabel" htmlFor="evTime">
          Start time <span>· leave empty for all day</span>
        </label>
        <input
          id="evTime"
          type="time"
          className="editinput"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
        />

        <label className="flabel" htmlFor="evPlace">
          Where
        </label>
        <input
          id="evPlace"
          className="editinput"
          placeholder="e.g. Harborside, Jersey City"
          value={place}
          onChange={(e) => setPlace(e.target.value)}
        />

        <label className="flabel" htmlFor="evCity">
          City <span>· so the city filter finds it</span>
        </label>
        <input
          id="evCity"
          className="editinput"
          placeholder="e.g. Jersey City, NJ"
          value={city}
          onChange={(e) => setCity(e.target.value)}
        />

        <label className="flabel" htmlFor="evHost">
          Hosted by <span>· if that isn&rsquo;t you</span>
        </label>
        <input
          id="evHost"
          className="editinput"
          placeholder="e.g. Hudson Fit Expo"
          value={host}
          onChange={(e) => setHost(e.target.value)}
        />

        <label className="flabel" htmlFor="evLink">
          Link <span>· tickets or details</span>
        </label>
        <input
          id="evLink"
          className="editinput"
          inputMode="url"
          placeholder="https://…"
          value={link}
          onChange={(e) => setLink(e.target.value)}
        />

        <label className="flabel" htmlFor="evDesc">
          About <span>· optional</span>
        </label>
        <textarea
          id="evDesc"
          className="editinput evabout"
          rows={3}
          placeholder="What it is, who it's for."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <label className="flabel">
          Flyer <span>· makes the listing a card</span>
        </label>
        {photo ? (
          <div className="evflyer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo} alt="" />
            <button type="button" className="tertiary" onClick={() => setPhoto(null)}>
              Remove
            </button>
          </div>
        ) : (
          <label className="btn ghost evpick">
            Add a flyer
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => e.target.files?.[0] && pickPhoto(e.target.files[0])}
            />
          </label>
        )}

        {error && (
          <p className="empty" style={{ paddingBottom: 0 }}>
            {error}
          </p>
        )}
        <div className="publishwrap">
          <button className="btn si" disabled={pending} onClick={submit}>
            {pending ? "Posting…" : "Post event"}
          </button>
        </div>
      </div>
    </div>
  );
}

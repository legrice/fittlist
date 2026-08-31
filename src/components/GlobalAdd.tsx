"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { globalComposerData } from "@/app/actions/composer";
import { setGoing } from "@/app/actions/going";
import type { PersonalMatch } from "@/app/actions/personal";
import {
  createStudio,
  findStudioMatches,
  type StudioMatch,
} from "@/app/actions/studios";
import { Adder } from "@/components/Adder";
import { AddBrowse } from "@/components/AddBrowse";
import { CreateGroupSheet } from "@/components/SavedScreen";
import { Icon } from "@/components/Icon";
import { Toast, useToast } from "@/components/Toast";
import { TypeMultiSelect } from "@/components/TypePicker";
import { readPhoto } from "@/lib/photo";
import { PLACE_KIND_LABELS, PLACE_KINDS, type PlaceKind } from "@/lib/studio";
import type { LastUsed, StudioDto, TemplateDto } from "@/lib/types";

type ComposerData = {
  studios: StudioDto[];
  templates: TemplateDto[];
  customTypes: string[];
  lastUsed: LastUsed;
  canCoach: boolean;
};

const placeKey = (value: string) =>
  value.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");

export function GlobalAdd({
  floating = false,
  classOnly = false,
  triggerClassName,
  triggerLabel,
  onCalendarChange,
}: {
  floating?: boolean;
  classOnly?: boolean;
  /** Desktop can give the same composer a full-width labelled trigger while
   * phone headers keep the compact plus button. */
  triggerClassName?: string;
  triggerLabel?: string;
  /** Lets a calendar reveal and highlight the exact occurrence just added. */
  onCalendarChange?: (focus?: { id: string; iso: string }) => void;
} = {}) {
  const [open, setOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [mode, setMode] = useState<null | "class" | "browse" | "personal" | "place">(null);
  const [classRole, setClassRole] = useState<null | "coaching" | "attending">(null);
  const [placeStep, setPlaceStep] = useState<"identity" | "details">("identity");
  const [data, setData] = useState<ComposerData | null>(null);
  const [pending, startTransition] = useTransition();
  const [placeName, setPlaceName] = useState("");
  const [placeAddress, setPlaceAddress] = useState("");
  const [placeKind, setPlaceKind] = useState<PlaceKind>("studio");
  const [placeTypes, setPlaceTypes] = useState<string[]>([]);
  const [placeAbout, setPlaceAbout] = useState("");
  const [placePhoto, setPlacePhoto] = useState<string | null>(null);
  const [placeEmail, setPlaceEmail] = useState("");
  const [placePhone, setPlacePhone] = useState("");
  const [placeWebsite, setPlaceWebsite] = useState("");
  const [placeInstagram, setPlaceInstagram] = useState("");
  const [placeMatches, setPlaceMatches] = useState<StudioMatch[]>([]);
  const [match, setMatch] = useState<PersonalMatch | null>(null);
  const [matching, setMatching] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [toastMsg, toastOn, toast] = useToast();
  const router = useRouter();

  useEffect(() => {
    const query = placeName.trim();
    if (mode !== "place" || placeStep !== "identity" || query.length < 2) {
      setPlaceMatches([]);
      setMatching(false);
      return;
    }
    let current = true;
    setMatching(true);
    const timer = window.setTimeout(async () => {
      try {
        const matches = await findStudioMatches(query, placeKind);
        if (current) setPlaceMatches(matches);
      } finally {
        if (current) setMatching(false);
      }
    }, 220);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [mode, placeKind, placeName, placeStep]);

  const exactMatch = placeMatches.find(
    (studio) => placeKey(studio.name) === placeKey(placeName),
  );
  const needsAddress = placeKind !== "virtual";
  const locationLabel =
    placeKind === "studio" || placeKind === "wellness" ? "Address" : "Location";

  const resetPlace = () => {
    setPlaceStep("identity");
    setPlaceName("");
    setPlaceAddress("");
    setPlaceKind("studio");
    setPlaceTypes([]);
    setPlaceAbout("");
    setPlacePhoto(null);
    setPlaceEmail("");
    setPlacePhone("");
    setPlaceWebsite("");
    setPlaceInstagram("");
    setPlaceMatches([]);
  };
  const close = () => {
    setOpen(false);
    setMode(null);
    setClassRole(null);
    resetPlace();
  };
  const openGroup = () => {
    close();
    setGroupOpen(true);
  };
  const openChooser = () => {
    if (classOnly) {
      startTransition(async () => {
        const loaded = data ?? (await globalComposerData());
        if (!loaded) {
          toast("Sign in to add to FittList");
          return;
        }
        setData(loaded);
        setClassRole(loaded.canCoach ? null : "attending");
        setMode(loaded.canCoach ? "class" : "browse");
        setOpen(true);
      });
      return;
    }
    startTransition(async () => {
      const loaded = data ?? (await globalComposerData());
      if (!loaded) {
        toast("Sign in to add to FittList");
        return;
      }
      setData(loaded);
      setOpen(true);
    });
  };
  const choose = (next: "class" | "personal" | "place") => {
    if (next === "place") {
      setMode(next);
      return;
    }
    startTransition(async () => {
      const loaded = data ?? (await globalComposerData());
      if (!loaded) {
        toast("Sign in to add to FittList");
        return;
      }
      setData(loaded);
      setClassRole(next === "personal" ? "attending" : loaded.canCoach ? null : "attending");
      setMode(next);
    });
  };
  const addPlace = () =>
    startTransition(async () => {
      const result = await createStudio(placeName, placeAddress, placeKind, {
        types: placeTypes,
        about: placeAbout,
        photo: placePhoto,
        contactEmail: placeEmail,
        phone: placePhone,
        website: placeWebsite,
        instagram: placeInstagram,
      });
      if (!result.ok) {
        if (result.duplicate) {
          setPlaceMatches((current) =>
            current.some((studio) => studio.id === result.duplicate!.id)
              ? current
              : [result.duplicate!, ...current],
          );
          setPlaceStep("identity");
        }
        toast(result.error ?? "Something went wrong");
        return;
      }
      close();
      toast("Place added");
      router.refresh();
    });

  const placeIdentity = (
    <>
      <h2 id="globaladd-title">Add a place</h2>
      <p className="lead">First, make sure it is not already on FittList.</p>
      <div className="globaladd-place">
        <label>
          Place type
          <select
            value={placeKind}
            onChange={(event) => {
              setPlaceKind(event.target.value as PlaceKind);
              setPlaceMatches([]);
            }}
          >
            {PLACE_KINDS.map((kind) => (
              <option key={kind} value={kind}>{PLACE_KIND_LABELS[kind]}</option>
            ))}
          </select>
        </label>
        <label>
          Name
          <input
            autoComplete="off"
            value={placeName}
            onChange={(event) => setPlaceName(event.target.value)}
            placeholder="Start typing the place name"
          />
        </label>
        {(matching || placeMatches.length > 0) && (
          <div className="globaladd-matches" aria-live="polite">
            <span>{matching ? "Checking FittList…" : `Existing ${PLACE_KIND_LABELS[placeKind].toLowerCase()}s`}</span>
            {placeMatches.map((studio) => (
              <button
                key={studio.id}
                type="button"
                onClick={() => {
                  if (studio.slug) {
                    close();
                    router.push(`/s/${studio.slug}`);
                  }
                }}
                disabled={!studio.slug}
              >
                <span>
                  <b>{studio.name}</b>
                  {studio.address && <small>{studio.address}</small>}
                </span>
                {studio.slug && <em>View place</em>}
              </button>
            ))}
            {exactMatch && (
              <p>
                {placeKind === "virtual"
                  ? "This virtual place already exists. Open it instead of adding another copy."
                  : "If this is the same place, open it. If it is another location, continue."}
              </p>
            )}
          </div>
        )}
        <button
          className="btn si"
          disabled={pending || !placeName.trim() || (placeKind === "virtual" && Boolean(exactMatch))}
          onClick={() => setPlaceStep("details")}
        >
          {placeKind === "virtual" && exactMatch
            ? "Already on FittList"
            : exactMatch
              ? "Add a different location"
              : "Continue"}
        </button>
      </div>
    </>
  );

  const placeDetails = (
    <>
      <div className="adderhead">
        <button
          className="iconbtn sheetclose adderback"
          aria-label="Back"
          onClick={() => setPlaceStep("identity")}
        >
          <Icon name="arrow_back" size={20} />
        </button>
        <h2 id="globaladd-title">Tell us about {placeName}</h2>
        <button className="iconbtn sheetclose adderclose" aria-label="Close" onClick={close}>
          <Icon name="close" size={18} />
        </button>
      </div>
      <p className="lead">A few details make the page useful from day one.</p>
      <div className="globaladd-place globaladd-details">
        {needsAddress && (
          <label>
            {locationLabel}
            <input
              value={placeAddress}
              onChange={(event) => setPlaceAddress(event.target.value)}
              placeholder={
                placeKind === "outdoor"
                  ? "Park, meeting point, or neighborhood"
                  : placeKind === "event"
                    ? "Venue or event location"
                    : "Street address"
              }
            />
          </label>
        )}
        <label>
          What happens here? <span>Pick everything that fits</span>
          <TypeMultiSelect
            value={placeTypes}
            onChange={setPlaceTypes}
            placeholder="Choose categories"
            title={`What happens at ${placeName}?`}
          />
        </label>
        <label>
          About
          <textarea
            className="abouttext"
            rows={3}
            value={placeAbout}
            onChange={(event) => setPlaceAbout(event.target.value)}
            placeholder={
              placeKind === "virtual"
                ? "What people can join and what to expect"
                : "What the place is like and what to expect"
            }
          />
        </label>
        <label>Photo</label>
        <div className="editphoto globaladd-photo">
          {placePhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="editphoto-img" src={placePhoto} alt="" />
          ) : (
            <div className="editphoto-img editphoto-empty" aria-hidden="true">
              <Icon name="place" size={28} />
            </div>
          )}
          <div className="editphoto-actions">
            <button className="btn ghost" onClick={() => fileRef.current?.click()}>
              {placePhoto ? "Change photo" : "Add photo"}
            </button>
            {placePhoto && (
              <button className="btn ghost" onClick={() => setPlacePhoto(null)}>Remove</button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) readPhoto(file, setPlacePhoto, () => toast("That photo format isn't supported."));
              event.target.value = "";
            }}
          />
        </div>
        <label>
          {placeKind === "virtual" ? "Join link or website" : "Website"}
          <input
            type="url"
            inputMode="url"
            value={placeWebsite}
            onChange={(event) => setPlaceWebsite(event.target.value)}
            placeholder="https://"
          />
        </label>
        <label>
          Instagram
          <input
            value={placeInstagram}
            onChange={(event) => setPlaceInstagram(event.target.value)}
            placeholder="username"
          />
        </label>
        <label>
          Contact email
          <input
            type="email"
            inputMode="email"
            value={placeEmail}
            onChange={(event) => setPlaceEmail(event.target.value)}
            placeholder="hello@example.com"
          />
        </label>
        {(placeKind === "studio" || placeKind === "wellness") && (
          <label>
            Phone
            <input
              type="tel"
              inputMode="tel"
              value={placePhone}
              onChange={(event) => setPlacePhone(event.target.value)}
            />
          </label>
        )}
        <button
          className="btn si"
          disabled={pending || (needsAddress && !placeAddress.trim())}
          onClick={addPlace}
        >
          {pending ? "Adding…" : "Add place"}
        </button>
      </div>
    </>
  );

  const composer =
    open && typeof document !== "undefined"
      ? createPortal(
          mode === "browse" && data ? (
            <AddBrowse
              onClose={close}
              onAddNew={() => {
                setClassRole("attending");
                setMode("class");
              }}
              onEvent={() => setMode("personal")}
              onNotice={(message, highlight) => {
                toast(message);
                if (highlight) {
                  const dot = highlight.lastIndexOf(".");
                  if (dot > 0) onCalendarChange?.({ id: highlight.slice(0, dot), iso: highlight.slice(dot + 1) });
                  close();
                }
                router.refresh();
              }}
            />
          ) : data && (mode === "class" || mode === "personal") && classRole ? (
            <Adder
              studios={data.studios}
              templates={data.templates}
              customTypes={data.customTypes}
              lastUsed={data.lastUsed}
              subsCount={0}
              firstPublish={false}
              personal={
                mode === "personal"
                  ? { canCoach: false, event: true, oneOff: true }
                  : classRole === "attending"
                    ? { canCoach: false, event: false, oneOff: true }
                    : undefined
              }
              // The class editor is the whole Calendar add flow. Clearing
              // only its mode left the parent open and exposed the generic
              // class/group/studio chooser underneath when X was tapped.
              onClose={close}
              onToast={toast}
              onPublished={(message, _planId, _live, focus) => {
                close();
                toast(message);
                onCalendarChange?.(focus);
                router.refresh();
              }}
              onDeleted={(message) => {
                close();
                toast(message);
                router.refresh();
              }}
              onMatch={(found) => {
                setOpen(false);
                setMode(null);
                setClassRole(null);
                setMatch(found);
              }}
            />
          ) :
          <div
            className={`sheet-scrim globaladd-scrim${mode ? " flow" : " chooser"}`}
            onClick={(event) => {
              if (event.target === event.currentTarget) close();
            }}
          >
            {mode ? (
              <div
                className={`sheet globaladd-sheet${mode === "place" && placeStep === "details" ? " sheet-full" : ""}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby="globaladd-title"
              >
                {placeStep !== "details" && (
                  <button className="iconbtn sheetclose" aria-label="Close" onClick={close}>
                    <Icon name="close" size={18} />
                  </button>
                )}
                {mode === "place" && (placeStep === "identity" ? placeIdentity : placeDetails)}
                {mode === "class" && data?.canCoach && !classRole && (
                  <div className="globaladd-role">
                    <h2 id="globaladd-title">Add a class</h2>
                    <p>Are you coaching or attending?</p>
                    <div className="globaladd-role-options">
                      <button type="button" onClick={() => setClassRole("coaching")}>I&rsquo;m coaching</button>
                      <button type="button" onClick={() => setMode("browse")}>I&rsquo;m attending</button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div
                className="sheet globaladd-chooser"
                role="dialog"
                aria-modal="true"
                aria-labelledby="globaladd-chooser-title"
              >
                <button className="iconbtn sheetclose" aria-label="Close add menu" onClick={close}>
                  <Icon name="close" size={18} />
                </button>
                <h2 id="globaladd-chooser-title">Create</h2>
                <p className="lead">What would you like to add?</p>
                <div className="globaladd-chooser-options">
                  <button type="button" disabled={pending} onClick={() => choose("class")}>
                    <i><Icon name="calendar_month" size={23} /></i>
                    <span>Add a class</span>
                    <Icon name="chevron_right" size={20} />
                  </button>
                  <button type="button" disabled={pending} onClick={openGroup}>
                    <i><Icon name="groups" size={23} /></i>
                    <span>Add a group</span>
                    <Icon name="chevron_right" size={20} />
                  </button>
                  <button type="button" disabled={pending} onClick={() => choose("place")}>
                    <i><Icon name="storefront" size={23} /></i>
                    <span>Add a studio</span>
                    <Icon name="chevron_right" size={20} />
                  </button>
                </div>
              </div>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        className={triggerClassName ?? (floating ? "wkfab" : "iconbtn")}
        aria-label={classOnly ? "Add a class" : "Add"}
        disabled={pending}
        onClick={openChooser}
      >
        <Icon name="add" size={24} />
        {triggerLabel && <span>{triggerLabel}</span>}
      </button>
      {composer}
      {groupOpen && typeof document !== "undefined" && createPortal(
        <CreateGroupSheet onClose={() => setGroupOpen(false)} />,
        document.body,
      )}
      {match && typeof document !== "undefined" && createPortal(
        <div className="sheet-scrim" onClick={(event) => { if (event.target === event.currentTarget) setMatch(null); }}>
          <div className="sheet confirmsheet" role="dialog" aria-modal="true">
            <h2>That class is already on FittList</h2>
            <p className="lead">
              {match.name} with {match.coachName} is already listed at that time and place. Add the existing class so updates stay in sync.
            </p>
            <div className="publishwrap nostick">
              <button
                className="btn si"
                disabled={pending}
                onClick={() => startTransition(async () => {
                  const result = await setGoing(match.classId, match.iso, true);
                  if (!result.ok) {
                    toast(result.error ?? "Couldn't add that");
                    return;
                  }
                  toast(`${match.name} was saved to your calendar`);
                  onCalendarChange?.({ id: match.classId, iso: match.iso });
                  setMatch(null);
                  setOpen(false);
                  router.refresh();
                })}
              >
                Add existing class
              </button>
              <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => setMatch(null)}>Go back</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
      <Toast msg={toastMsg} on={toastOn} />
    </>
  );
}

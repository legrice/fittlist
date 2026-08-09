"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  deleteClass,
  getStudioCatalog,
  publishClasses,
  updateClass,
} from "@/app/actions/classes";
import { addGymClass, deleteGymClass, updateGymClass } from "@/app/actions/gym";
import {
  addPersonalClass,
  removePersonalClass,
  updatePersonalClass,
  type PersonalMatch,
} from "@/app/actions/personal";
import { createStudio } from "@/app/actions/studios";
import type { BookingLink } from "@/db/schema";
import {
  CLASS_TYPES,
  DAYS,
  detectProvider,
  fmtDays,
  minutesToTime,
  timeToMinutes,
  todayIso,
} from "@/lib/format";
import type { LastUsed, StudioDto, TemplateDto } from "@/lib/types";
import { Icon } from "@/components/Icon";
import { readPhoto } from "@/lib/photo";

export type AdderPrefill = {
  name: string;
  classType?: string | null;
  description?: string | null;
  image?: string | null;
  startTime: string;
  durationMin: number;
  studioId: string | null;
  location?: string | null;
  isPublic?: boolean;
  rsvp?: boolean;
  links: BookingLink[];
  withWho?: string | null; // personal only: the name they typed for the coach
  days?: number[]; // preselected (edit); empty for duplicate
  dayOfWeek?: number; // the weekday actually opened, for the delete choice
  endsOn?: string | null; // weekly only: last date it runs
  occurrenceDate?: string | null; // the dated row actually tapped, for "just this one"
  specificDate?: string | null; // set = editing a one-off pinned to this date
  classId?: string; // set = edit this class in place
};

const DAY_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

type CatalogItem = {
  name: string;
  classType: string | null;
  description: string | null;
  image?: string | null;
  /** How long it runs. A gym filling a week types the same 60 over and over
   *  otherwise, and the length belongs to the class rather than the slot. */
  durationMin?: number | null;
  links?: BookingLink[];
};

/**
 * A gym running its own schedule fills a class in exactly the way a coach
 * does, so it gets this form rather than one of its own. What differs is only
 * what has to: the studio is the gym's and never asked for, a gym has no
 * private classes, and one field is the rota.
 */
export type AdderGym = {
  studioId: string;
  coaches: { id: string; name: string }[];
  /** Classes already described at this studio, ready to pull in. */
  catalog: CatalogItem[];
  /** Who normally teaches the slot being edited. */
  coachUserId?: string | null;
  /** Who's on the one date that was tapped. Saves as you pick, so the rota
   *  owns it and hands it down rather than the form holding it. */
  dateSwap?: React.ReactNode;
};

/**
 * The same form, filling in a class you go to rather than one you teach.
 *
 * It was five fields in a sheet of its own, which meant the class you booked
 * through ClassPass arrived with no studio, no description and no picture, and
 * the next person to add it got none of that either. A class is a class; only
 * where it lands differs, and that is one branch at the end.
 *
 * `canCoach` is the one question this mode asks that the other doesn't: a
 * coach adding a class at their own gym might be teaching it, and the answer
 * decides whether it goes to their page or only to their plans.
 */
export type AdderPersonal = {
  canCoach: boolean;
  /** Set = editing this personal_classes row rather than adding one. One row
   *  is one entry, so the day pills move it instead of fanning it out. */
  editId?: string;
  /** Not a class at all: an appointment, a session, your own time. The same
   *  personal row underneath, with the class-shaped fields (studio, type,
   *  photo, the catalog write) put away, because a dentist appointment has
   *  no studio and should touch nothing shared. */
  event?: boolean;
  /** A dated entry only, no weekly repeat: the member's share week is built
   *  of the classes they are going to, and "going" names a date. The When
   *  card drops its toggle and asks for the date alone. */
  oneOff?: boolean;
};

type Stage = "start" | "form" | "pick" | "class" | "new";

export function Adder({
  studios: studiosProp,
  templates,
  customTypes,
  lastUsed,
  subsCount,
  prefill,
  firstPublish,
  gym,
  personal,
  onClose,
  onToast,
  onPublished,
  onDeleted,
  onMatch,
}: {
  studios: StudioDto[];
  templates: TemplateDto[];
  customTypes: string[];
  lastUsed: LastUsed;
  subsCount: number;
  prefill?: AdderPrefill;
  firstPublish: boolean;
  /** Set when a gym's manager is filling this in, not a coach. */
  gym?: AdderGym;
  /** Set when this is going to somebody's plans rather than their page. */
  personal?: AdderPersonal;
  onClose: () => void;
  onToast: (msg: string) => void;
  /** The second argument is the personal_classes row, set only when adding
   *  one of your own and only when it was a single row: the plans screen
   *  offers to share it, and a picture needs to know which one. */
  /** `live` arrives for a brand new public class: the just-published thing,
   *  so the host can offer sharing it while the moment is warm. */
  onPublished: (msg: string, planId?: string, live?: { id: string; name: string }) => void;
  onDeleted: (msg: string) => void;
  /** Personal mode only: the class they're describing is already on fittlist,
   *  under somebody who keeps it up to date. The caller offers the real one,
   *  and `again` is this same form resubmitted for "mine anyway", so the
   *  answer doesn't cost them everything they typed. */
  onMatch?: (m: PersonalMatch, again: () => void) => void;
}) {
  const isEdit = Boolean(prefill?.classId);
  // Yours alone, and already saved. Kept apart from isEdit because that one
  // carries a coach's class with it: a delete that walks a series, a rota, a
  // studio catalog. This is one row.
  const isPersonalEdit = Boolean(personal?.editId);
  const isGym = Boolean(gym);
  const isPersonal = Boolean(personal);
  const isEvent = Boolean(personal?.event);
  // Which chair you're in. A member is only ever going; a coach is asked, and
  // "going" is the answer that brought them to this form.
  const [role, setRole] = useState<"going" | "coaching">("going");
  // Coaching it makes it a real class again, all the way down to the wording.
  const mineOnly = isPersonal && role === "going";
  const [studios, setStudios] = useState(studiosProp);
  // A brand-new coach class walks in steps, by Matt's call: the studio, then
  // the studio's own class list, then the form with the times. One long sheet
  // asked for a lot of scrolling before the one decision that scopes the rest
  // (where), and the catalog was hidden inside a name field's autocomplete.
  // Everything else (an edit, a duplicate, a gym's slot, a personal entry)
  // keeps the single form: their answers are already mostly filled.
  // Stepped for a coach's brand-new class, and for a member's share-week
  // add, by Matt's call: the studio first, then the studio's own list
  // (which is the catalog handing the details back), then the form. A
  // studio-less entry still goes through the form's own picker elsewhere.
  const stepped =
    !isGym &&
    !isEdit &&
    !prefill?.name &&
    (!isPersonal || (Boolean(personal?.oneOff) && !personal?.editId));
  const [stage, setStage] = useState<Stage>(stepped ? "pick" : "form");
  // A prefill with no name is a starting point, not a copy: the rota opens the
  // form on the day that was tapped, and that is still a new class.
  const [heading, setHeading] = useState<{ title: string; lead: string }>(
    personal
      ? isPersonalEdit
        ? {
            title: "Edit class",
            lead: "Change anything. Your week says the new version everywhere it shows.",
          }
        : personal.event
          ? {
              title: "New event",
              lead: "Anything on your calendar: an appointment, a session, time you're keeping. Yours alone; nothing public.",
            }
          : {
            title: "Add a class",
            lead: "A class you go to. It lands on your week, and a dated class shows on your profile until it has run. The studio gets the details so the next person doesn't type them again.",
          }
      : isEdit
      ? { title: "Edit class", lead: "Change anything. One save updates your page." }
      : prefill?.name
        ? { title: "Duplicate class", lead: "Same class. Pick the new days." }
        : {
            title: "New class",
            lead: "Type it once and fittlist remembers the whole class. Pick days; one publish covers them all.",
          },
  );
  const [name, setName] = useState(prefill?.name ?? "");
  const [classType, setClassType] = useState<string | null>(prefill?.classType ?? null);
  const [description, setDescription] = useState(prefill?.description ?? "");
  const [image, setImage] = useState<string | null>(prefill?.image ?? null);
  // Extra start times, gym-only and add-only. A gym's week is a grid: the same
  // class runs at five times on Mon/Wed/Fri and four on Tue/Thu, which is 23
  // slots to type one at a time. Days times times is how that becomes two
  // passes. Never on an edit: one row is one slot, editing moves that slot,
  // and fanning an edit out would delete and recreate rows that carry swaps
  // and members' plans.
  const [extraTimes, setExtraTimes] = useState<string[]>([]);
  const imgRef = useRef<HTMLInputElement>(null);
  const [days, setDays] = useState<Set<number>>(new Set(prefill?.days ?? []));
  const [mode, setMode] = useState<"weekly" | "date">(
    prefill?.specificDate || personal?.oneOff ? "date" : "weekly",
  );
  // null = runs forever (the default); a string = the picker is showing.
  const [endsOn, setEndsOn] = useState<string | null>(prefill?.endsOn ?? null);
  // A share-week add starts on today rather than a blank field: the date is
  // the one thing the flow already knows something about.
  const [date, setDate] = useState(prefill?.specificDate ?? (personal?.oneOff ? todayIso() : ""));
  const initStart = prefill?.startTime ?? lastUsed.startTime;
  const initDur = prefill?.durationMin ?? lastUsed.durationMin;
  const [time, setTime] = useState(initStart);
  const [end, setEnd] = useState(minutesToTime(timeToMinutes(initStart) + initDur));
  // No studio prefill on a brand-new class: an already-filled gym reads as a
  // mistake. Editing/duplicating still carries the class's studio.
  // A gym's schedule is the gym's, at the gym: the picker never comes up.
  const [studioId, setStudioId] = useState<string | null>(gym?.studioId ?? prefill?.studioId ?? null);
  // Public by default; private items are the coach's own work (PT clients etc.).
  // A gym has none: its schedule is the thing it publishes.
  // The Public/Private control is off the form for now (see the note where it
  // rendered), so this is state without a setter: new classes are public, and
  // an edit keeps whatever the class already was.
  const [isPublic] = useState<boolean>(gym ? true : prefill?.isPublic ?? true);
  // Ask people to RSVP: a save the organizer can see. Coaching only, and
  // deliberately nothing more (no capacity, no waitlist): capacity is the
  // line that turns RSVP into a booking system.
  const [rsvp, setRsvp] = useState<boolean>(prefill?.rsvp ?? false);
  // The rota, on a gym's class. Null on a coach's own.
  const [coachUserId, setCoachUserId] = useState(gym?.coachUserId ?? "");
  const [location, setLocation] = useState(prefill?.location ?? "");
  // Who teaches it, as free text. Not a users reference: naming your coach is
  // not putting them on the platform, and every name here is an invite lead.
  const [withWho, setWithWho] = useState(prefill?.withWho ?? "");
  const [links, setLinks] = useState<BookingLink[]>(prefill?.links ?? []);
  const [sugOpen, setSugOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [nsName, setNsName] = useState("");
  const [nsAddr, setNsAddr] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  // Studio-first: the class list is scoped to the chosen studio's catalog. A
  // gym is handed its own, links and all, because it is the studio.
  const [fetched, setFetched] = useState<CatalogItem[]>([]);
  const [catLoading, setCatLoading] = useState(false);
  const catalog = gym ? gym.catalog : fetched;
  const studioById = useMemo(() => new Map(studios.map((s) => [s.id, s])), [studios]);
  const selectedStudio = studioId ? studioById.get(studioId) : undefined;

  // Load the studio's shared class catalog whenever the studio changes.
  useEffect(() => {
    if (isGym || !studioId) {
      setFetched([]);
      return;
    }
    let live = true;
    setCatLoading(true);
    getStudioCatalog(studioId).then((rows) => {
      if (live) {
        setFetched(rows);
        setCatLoading(false);
      }
    });
    return () => {
      live = false;
    };
  }, [studioId, isGym]);

  // Reuse a class already logged at this studio: fills the name, type, and
  // description, leaving the coach to set their own time, days, and links.
  const fillFromCatalog = (c: CatalogItem) => {
    setName(c.name);
    setClassType(c.classType ?? null);
    setDescription(c.description ?? "");
    // The photograph comes with the description: it belongs to the class, not
    // to whoever happened to write it down first.
    if (c.image) setImage(c.image);
    // So does the length, which moves the end time with it.
    if (c.durationMin && c.durationMin > 0) setEnd(minutesToTime(timeToMinutes(time) + c.durationMin));
    // The studio catalog is shared across coaches and deliberately carries no
    // booking links: another coach's booking page isn't yours. But if this
    // coach has run the class before, their own links come back with it. A gym
    // pulling in its own studio's link is the same booking page either way, so
    // there it comes along.
    if (c.links?.length) {
      setLinks(c.links.map((l) => ({ ...l })));
      return;
    }
    const mine = templates.find((t) => t.name.toLowerCase() === c.name.toLowerCase());
    if (mine?.links.length) setLinks(mine.links.map((l) => ({ ...l })));
  };

  // The Type dropdown: curated categories, any types already saved for this
  // coach, plus the class's own type if it isn't in either list yet (e.g.
  // editing an older class).
  const typeOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of [...CLASS_TYPES, ...customTypes, ...(classType ? [classType] : [])]) {
      const k = t.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        out.push(t);
      }
    }
    return out;
  }, [customTypes, classType]);

  // Length is the gap between start and end; changing the start slides the end
  // to keep the same length (like a calendar event), changing the end sets it.
  const durationMin = timeToMinutes(end) - timeToMinutes(time);
  const durValid = durationMin > 0;
  const changeStart = (v: string) => {
    if (!v) return;
    if (durValid) setEnd(minutesToTime(timeToMinutes(v) + durationMin));
    setTime(v);
  };

  // Filling one of your own from your own catalog: the thing you did last
  // week, back with its place, its length and who it was with. This is the
  // case the studio catalog cannot serve, because a 1:1 at a client's home
  // has no studio to have a catalog.
  const fillFromMine = (m: TemplateDto) => {
    setName(m.name);
    setClassType(m.classType ?? null);
    setDescription(m.description ?? "");
    if (m.image) setImage(m.image);
    // The time comes back too: a thing you do again is usually a thing you
    // do again at the same time. The end follows the length, the way it does
    // everywhere else in this form.
    setTime(m.startTime);
    setEnd(minutesToTime(timeToMinutes(m.startTime) + m.durationMin));
    setStudioId(m.studioId);
    setLocation(m.studioId ? "" : (m.location ?? ""));
    setWithWho(m.withWho ?? "");
    if (m.links.length) setLinks(m.links.map((l) => ({ ...l })));
  };

  // Your own past entries, for the personal form. A schedule that is all
  // over the place but repeats is what this product is for, so the second
  // "Training with Kia" should not be retyped. Only your private ones: a
  // class you teach is not something you go to.
  const myPast = useMemo(() => {
    if (!personal) return [];
    const q = name.trim().toLowerCase();
    return templates
      .filter((m) => !m.isPublic)
      .filter((m) => (q ? m.name.toLowerCase().includes(q) && m.name.toLowerCase() !== q : true))
      .slice(0, 6);
  }, [personal, templates, name]);

  // Classes already run at the chosen studio, offered in the name field: all of
  // them when the field is empty, filtered as you type.
  const suggestions = useMemo(() => {
    const q = name.trim().toLowerCase();
    const pool = q
      ? catalog.filter((c) => c.name.toLowerCase().includes(q) && c.name.toLowerCase() !== q)
      : catalog;
    // Your own come first and win a name outright: yours knows the time, the
    // length and who it was with, which the studio's shared row never does.
    const mine = new Set(myPast.map((m) => m.name.toLowerCase()));
    return pool.filter((c) => !mine.has(c.name.toLowerCase())).slice(0, 8);
  }, [name, catalog, myPast]);

  const toggleDay = (i: number) => {
    // One row is one slot on a rota, so editing a gym's class moves the day it
    // runs rather than fanning it across more of them. A second day is a second
    // slot, added from the day it belongs to. One of your own entries is one
    // row for the same reason.
    if ((isGym && isEdit) || isPersonalEdit) {
      setDays(new Set([i]));
      return;
    }
    setDays((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const n = days.size;
  const oneTime = mode === "date";
  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const whenChosen = oneTime ? dateValid : n > 0;
  // Days times times, deduped, the way the server counts it. Shown before the
  // add so a manager knows they are about to make fifteen classes.
  const allTimeCount = new Set([time, ...extraTimes].filter(Boolean)).size;
  const slotCount = (oneTime ? 1 : days.size) * allTimeCount;
  // Public classes need a studio; private ones don't, and neither does one
  // that's only ever going to sit in your own plans.
  const needsStudio = !gym && !mineOnly && isPublic && !selectedStudio;
  const publishLabel = !whenChosen
    ? oneTime
      ? "Pick a date"
      : isGym && isEdit
        ? "Pick a day"
        : "Pick at least one day"
    : needsStudio
      ? "Pick a studio"
      : !durValid
        ? "End time must be after start"
        : isEdit || isPersonalEdit
          ? "Save changes"
          : gym
            ? "Add to the schedule"
            : mineOnly
              ? isEvent
                ? "Add to your calendar"
                : "Add to your plans"
              : isPublic
                ? "Publish class"
                : "Save class";

  // Your own plans. `force` is the second pass, after they've seen that the
  // class is already here under a coach and said theirs anyway.
  const savePersonal = async (force: boolean) => {
    const input = {
      name,
      days: [...days],
      startTime: time,
      durationMin,
      location,
      withWho,
      studioId,
      classType,
      description,
      image,
      links,
      specificDate: oneTime ? date : null,
      endsOn: oneTime ? null : endsOn || null,
    };
    // Editing is its own call and its own ending: one row moves, and there is
    // no "this is already on fittlist" to offer somebody who wrote it down
    // weeks ago.
    if (personal?.editId) {
      const res = await updatePersonalClass(personal.editId, input);
      if (!res.ok) {
        onToast(res.error ?? "Couldn't save that");
        return;
      }
      onPublished("Saved");
      return;
    }
    const res = await addPersonalClass({ ...input, force });
    if (!res.ok) {
      if (res.match && onMatch) {
        onMatch(res.match, () => startTransition(() => void savePersonal(true)));
        return;
      }
      onToast(res.error ?? "Couldn't add that");
      return;
    }
    onPublished(
      isEvent
        ? "Added to your calendar"
        : n > 1
          ? `Added ${n} classes to your plans`
          : "Added to your plans",
      res.id,
    );
  };

  const publish = () => {
    if (!whenChosen || !durValid || (!mineOnly && isPublic && !studioId)) return;
    startTransition(async () => {
      const input = {
        name,
        classType,
        description,
        image,
        days: [...days],
        specificDate: oneTime ? date : null,
        endsOn: oneTime ? null : endsOn || null,
        startTime: time,
        times: extraTimes,
        durationMin,
        studioId,
        location,
        isPublic,
        rsvp,
        links,
      };
      // Yours to go to: the same class, written to your plans and to the
      // studio's catalog, and never to a page. No branch below this one can
      // reach `classes`, which is what keeps the wall where it is.
      if (mineOnly) {
        await savePersonal(false);
        return;
      }
      // Same fields, same validation, one field more: who's on it.
      const res = gym
        ? isEdit
          ? await updateGymClass(gym.studioId, prefill!.classId!, {
              ...input,
              coachUserId: coachUserId || null,
            })
          : await addGymClass(gym.studioId, { ...input, coachUserId: coachUserId || null })
        : isEdit
          ? await updateClass(prefill!.classId!, input)
          : await publishClasses(input);
      if (!res.ok) {
        onToast(res.error ?? "Something went wrong");
        return;
      }
      // What the server actually made, not how many days were picked: the grid
      // is days times times, and a second pass over a class skips the slots
      // that already run. `n` counted days, which was right while one add was
      // one slot per day and is a lie now.
      const made: number = "count" in res && typeof res.count === "number" ? res.count : n;
      onPublished(
        // Published from the plans screen, where it will not appear: it is a
        // class you teach now, and those live on your schedule. Say where it
        // went rather than leaving them looking for it.
        isPersonal
          ? "Added to your schedule"
          : isEdit
          ? "Saved"
          : gym
            ? made > 1
              ? `Added ${made} classes`
              : "Added to the week"
            : firstPublish
              ? "Your page is live"
              : `Published${n > 1 ? ` ${n} classes` : ""}`,
        undefined,
        // Only a brand new public class earns the share moment: an edit is
        // not news, and a private one has no page to hand anyone. The cast is
        // for the gym branch of the union, whose result carries no id.
        (() => {
          const id =
            !gym && !isEdit && !isPersonal && isPublic
              ? (res as { id?: string }).id
              : undefined;
          return id ? { id, name } : undefined;
        })(),
      );
    });
  };

  // A repeating class is several rows behind one card, so deleting has to ask
  // which it means — the day you opened, or every day it runs.
  const repeatDays = prefill?.specificDate ? [] : prefill?.days ?? [];
  const repeats = repeatDays.length > 1;
  const openedDay =
    prefill?.dayOfWeek !== undefined ? DAY_FULL[prefill.dayOfWeek] : "this day";
  // A standing class opened on a specific date can lose just that date — "I'm
  // off this Friday" — without touching the weeks either side of it.
  const occurrence = prefill?.specificDate ? null : prefill?.occurrenceDate ?? null;
  const occurrenceLabel = occurrence
    ? new Date(`${occurrence}T00:00:00Z`).toLocaleDateString("en-US", {
        weekday: "long",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      })
    : "";

  // One of your own is one row and nothing points at it, so removing it is
  // one call. For months this link only drew for a coach's class (isEdit is
  // prefill.classId, and a personal row edits by personal.editId), which is
  // the fourth-bug shape the doctrine warns about: built one side, invisible
  // on the other.
  const doDeletePersonal = () => {
    if (!personal?.editId) return;
    startTransition(async () => {
      const res = await removePersonalClass(personal.editId!);
      if (!res.ok) {
        onToast(res.error ?? "Something went wrong");
        return;
      }
      onDeleted("Removed");
    });
  };

  const doDelete = (scope: "occurrence" | "one" | "all") => {
    if (!prefill?.classId) return;
    startTransition(async () => {
      // A gym's slot is one row, so "every day it runs" never comes up: the
      // choice is this date off, or the slot gone.
      const res = gym
        ? await deleteGymClass(
            gym.studioId,
            prefill.classId!,
            scope === "occurrence" ? "occurrence" : "one",
            occurrence,
          )
        : await deleteClass(prefill.classId!, scope, occurrence);
      if (!res.ok) {
        onToast(res.error ?? "Something went wrong");
        return;
      }
      onDeleted(
        scope === "occurrence"
          ? `${occurrenceLabel} cancelled`
          : gym
            ? "Taken off the week"
            : res.count && res.count > 1
              ? `Deleted ${res.count} days`
              : "Deleted",
      );
    });
  };

  const addStudio = () => {
    startTransition(async () => {
      const res = await createStudio(nsName, nsAddr);
      if (!res.ok || !res.studio) {
        onToast(res.error ?? "Something went wrong");
        return;
      }
      setStudios((prev) => [...prev, res.studio!]);
      setStudioId(res.studio.id);
      // A studio you just added has no classes to offer, so the class step
      // would be an empty room with one door; straight to the form.
      setStage("form");
      onToast("Added to the studio directory");
    });
  };

  const filteredStudios = useMemo(() => {
    const q = search.trim().toLowerCase();
    return studios.filter(
      (s) => !q || s.name.toLowerCase().includes(q) || s.address.toLowerCase().includes(q),
    );
  }, [studios, search]);

  // The When card, defined once and rendered in one of two spots: stepped, it
  // leads the form (the studio and class are already answered); otherwise it
  // keeps its old place under the details.
  const whenCard = (
    <div className="adder-card">
            <label className="flabel">When</label>
            {/* The share week is dated by nature, so the toggle would only
                offer a wrong answer; everywhere else both are real. */}
            {!personal?.oneOff && (
              <div className="modetoggle">
                <button
                  className={!oneTime ? "sel" : ""}
                  onClick={() => setMode("weekly")}
                  type="button"
                >
                  Repeats weekly
                </button>
                <button
                  className={oneTime ? "sel" : ""}
                  onClick={() => setMode("date")}
                  type="button"
                >
                  One-time
                </button>
              </div>
            )}

            {oneTime ? (
              <>
                <label className="flabel">Date</label>
                <div className="timegrid">
                  <input
                    type="date"
                    className="timeinput"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    aria-label="Class date"
                  />
                </div>
              </>
            ) : (
              <>
                <label className="flabel">
                  {isGym && isEdit ? (
                    <>
                      Day <span>· the day this slot runs</span>
                    </>
                  ) : (
                    <>
                      Days <span>· tap all that apply</span>
                    </>
                  )}
                </label>
                <div className="daypick">
                  {DAYS.map((d, i) => (
                    <button
                      key={d}
                      className={days.has(i) ? "sel" : ""}
                      onClick={() => toggleDay(i)}
                    >
                      {d[0]}
                      {d[1].toLowerCase()}
                    </button>
                  ))}
                </div>
                {/* Most weekly classes run indefinitely, so this stays out of
                    the way until it's wanted — a term, a block, a cover. */}
                {endsOn === null ? (
                  <button className="tertiary endson-add" onClick={() => setEndsOn("")}>
                    + Add an end date
                  </button>
                ) : (
                  <>
                    <label className="flabel" htmlFor="fEndsOn">
                      Ends on <span>· last day it runs</span>
                    </label>
                    <div className="timegrid endson-row">
                      <input
                        id="fEndsOn"
                        type="date"
                        className="timeinput"
                        min={todayIso()}
                        value={endsOn}
                        onChange={(e) => setEndsOn(e.target.value)}
                        aria-label="Last day this class runs"
                      />
                      <button
                        className="tertiary"
                        onClick={() => setEndsOn(null)}
                        aria-label="Remove the end date"
                      >
                        Remove
                      </button>
                    </div>
                  </>
                )}
              </>
            )}

            <div className="timegrid two">
              <div>
                <label className="flabel" htmlFor="fStart">Start</label>
                <input
                  id="fStart"
                  type="time"
                  className="timeinput"
                  value={time}
                  onChange={(e) => changeStart(e.target.value)}
                  aria-label="Start time"
                />
              </div>
              <div>
                <label className="flabel" htmlFor="fEnd">End</label>
                <input
                  id="fEnd"
                  type="time"
                  className={`timeinput${durValid ? "" : " invalid"}`}
                  value={end}
                  onChange={(e) => e.target.value && setEnd(e.target.value)}
                  aria-label="End time"
                />
              </div>
            </div>
            <div className="durnote">
              {durValid ? `${durationMin} min` : "End time must be after start"}
            </div>

            {/* Also at. Gym-only, and never on an edit: adding fans out into a
                slot per day per time, while editing moves the one slot it was
                opened on. Fanning an edit out would mean deleting and
                recreating rows that carry swaps and members' plans. */}
            {gym && !isEdit && (
              <div className="alsoat">
                {extraTimes.map((t, i) => (
                  <div className="alsoat-row" key={i}>
                    <input
                      type="time"
                      className="timeinput"
                      value={t}
                      aria-label={`Also at, time ${i + 2}`}
                      onChange={(e) =>
                        setExtraTimes(extraTimes.map((x, j) => (j === i ? e.target.value : x)))
                      }
                    />
                    <button
                      type="button"
                      className="tertiary"
                      onClick={() => setExtraTimes(extraTimes.filter((_, j) => j !== i))}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="tertiary alsoat-add"
                  onClick={() => setExtraTimes([...extraTimes, time])}
                >
                  + Also at another time
                </button>
                {/* The number before you commit. A cross product grows fast,
                    and seeing it is what keeps this from feeling reckless. */}
                {slotCount > 1 && (
                  <p className="durnote alsoat-n">
                    Adds {slotCount} classes: {fmtDays([...days])} at {allTimeCount} times.
                  </p>
                )}
              </div>
            )}
            </div>
  );

  return (
    <div
      className="sheet-scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* The stepped stages are a bottom sheet sized to what they ask: type a
          studio, tap a class. Only the form takes the screen, because the
          form is the work; a picker that takes over first reads like a
          heavier decision than it is. */}
      <div className={`sheet adder${stage !== "form" ? " adder-step" : ""}`}>
        {stage !== "form" && (
          <button className="iconbtn sheetclose" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={18} />
          </button>
        )}

        {stage === "form" && (
          <div>
            {/* Sticky title bar: heading + close stay pinned while the form scrolls. */}
            <div className="adderhead">
              {/* The way back up the steps: the studio and the class were
                  answered on the screens behind this one, and changing that
                  answer should not mean starting over. */}
              {stepped && (
                <button
                  className="iconbtn adderback"
                  aria-label="Back"
                  onClick={() => setStage("class")}
                >
                  <Icon name="arrow_back" size={20} />
                </button>
              )}
              <h2>{stepped ? "Add a class" : heading.title}</h2>
              <button className="iconbtn sheetclose adderclose" aria-label="Close" onClick={onClose}>
                <Icon name="close" size={18} />
              </button>
            </div>
            {stepped && <p className="stepline">Step 3 of 3 &middot; The details</p>}

            {/* The rota. Who's on this one date is what a manager opens the
                week to change, so it leads; who normally has it is underneath,
                because changing that changes every week. */}
            {gym && (
              <div className="adder-card">
                {gym.dateSwap}
                <label className="flabel" htmlFor="fCoach">
                  {isEdit ? "Who normally coaches it" : "Who’s coaching"}
                </label>
                <select
                  id="fCoach"
                  className="typeselect"
                  value={coachUserId}
                  onChange={(e) => setCoachUserId(e.target.value)}
                >
                  <option value="">Nobody yet</option>
                  {gym.coaches.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <p className="durnote" style={{ marginTop: 8 }}>
                  They&rsquo;ll be told, and it lands in their calendar. Your schedule goes out
                  under the gym&rsquo;s name, so this stays between you and them.
                </p>
              </div>
            )}

            {/* Coaching it, or going to it. Only a coach is asked: a member
                has one answer and a question with one answer is furniture.
                Saying "I'm coaching it" hands the rest of the form back to the
                one that publishes, because from there it is a real class. */}
            {personal?.canCoach && !isPersonalEdit && (
              <div className="adder-card">
                <label className="flabel">Is this yours to teach?</label>
                <div className="modetoggle">
                  <button
                    type="button"
                    className={role === "going" ? "sel" : ""}
                    onClick={() => setRole("going")}
                  >
                    I&rsquo;m going
                  </button>
                  <button
                    type="button"
                    className={role === "coaching" ? "sel" : ""}
                    onClick={() => setRole("coaching")}
                  >
                    I&rsquo;m coaching it
                  </button>
                </div>
                <p className="durnote" style={{ marginTop: 8 }}>
                  {role === "going"
                    ? "It lands in your plans. Nothing about it appears on your page."
                    : "It goes on your schedule and your public page, like any class you teach."}
                </p>
              </div>
            )}

            {/* No Public/Private toggle for now, by Matt's call: a published
                class is public, and the whole form stays simple. The isPublic
                state and everything downstream of it survive untouched (an
                edit to an old private class keeps it private), so bringing
                the control back is re-rendering this block, not a migration. */}

            {/* An event has no studio: the field would invite the catalog
                write the event flavor exists to avoid. A plain Where does
                the job. */}
            {isEvent && (
              <div className="adder-card">
                <label className="flabel" htmlFor="fLoc">
                  Where <span>&middot; optional</span>
                </label>
                <input
                  id="fLoc"
                  className="editinput"
                  placeholder="e.g. Home, the park, Newark Airport"
                  value={location}
                  maxLength={120}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>
            )}
            {/* Studio: required for public, optional for private. A gym's
                classes are at the gym, so it is never asked. */}
            {!gym && !isEvent && (
            <div className="adder-card">
            <label className="flabel">
              Studio{(!isPublic || mineOnly) && <span> · optional</span>}
            </label>
            <button className="studio-sel" onClick={() => setStage("pick")}>
              {selectedStudio ? (
                <span className="studio-sel-txt">
                  <span className="nm">{selectedStudio.name}</span>
                  <span className="ad">{selectedStudio.address}</span>
                </span>
              ) : (
                <span className="nm placeholder">Select or start typing a studio</span>
              )}
              <span className="chev"><Icon name="chevron_right" size={20} /></span>
            </button>
            {(!isPublic || mineOnly) && !selectedStudio && (
              <>
                <label className="flabel" htmlFor="fLoc" style={{ marginTop: 12 }}>
                  Or type a location <span>· optional</span>
                </label>
                <input
                  id="fLoc"
                  className="editinput"
                  placeholder={mineOnly ? "e.g. Online, the park" : "e.g. Client's home, Online"}
                  value={location}
                  maxLength={120}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </>
            )}
            {mineOnly && (
              <>
                <label className="flabel" htmlFor="fWith" style={{ marginTop: 12 }}>
                  Who teaches it <span>· optional</span>
                </label>
                <input
                  id="fWith"
                  className="editinput"
                  placeholder="e.g. Jenny"
                  value={withWho}
                  maxLength={80}
                  onChange={(e) => setWithWho(e.target.value)}
                />
                {/* Said out loud, because it is the one thing here that leaves
                    your own week. The details go to the studio's list so the
                    next person typing this class gets them back; nothing goes
                    on the studio's page, and nothing says who added it. */}
                <p className="durnote" style={{ marginTop: 10 }}>
                  {selectedStudio
                    ? `The details are remembered for ${selectedStudio.name}, so the next person adding this class gets them filled in. Nothing shows on that page, and never who added it.`
                    : "Pick a studio and the details are remembered for it, so the next person adding this class gets them filled in. Nothing shows on that page, and never who added it."}
                </p>
              </>
            )}
            </div>
            )}

            {/* Stepped, the times lead: the studio and the class are already
                answered, so what is left to fill comes first and the details
                sit below for anyone who wants to touch them. */}
            {stepped && whenCard}

            <div className="adder-card">
            <label className="flabel" htmlFor="fName">
              {isEvent ? "What is it" : "Class name"}
              {(gym || selectedStudio) && catalog.length > 0 && !isEdit && (
                <span> · type new or pick one from this studio</span>
              )}
            </label>
            <div className="namefield">
              <input
                type="text"
                id="fName"
                placeholder={isEvent ? "e.g. PT session, physio, flight home" : "e.g. Barbell Strength"}
                autoComplete="off"
                value={name}
                onFocus={() => setSugOpen(true)}
                onChange={(e) => {
                  setName(e.target.value);
                  setSugOpen(true);
                }}
                onBlur={() => setTimeout(() => setSugOpen(false), 150)}
              />
              {sugOpen && (myPast.length > 0 || suggestions.length > 0) && (
                <div className="namesug">
                  {/* Yours first: it is the more specific answer. */}
                  {myPast.map((m) => (
                    <button
                      key={`mine-${m.name}`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        fillFromMine(m);
                        setSugOpen(false);
                        onToast("Filled from your last one");
                      }}
                    >
                      <span className="namesug-nm">{m.name}</span>
                      <span className="sub">Yours</span>
                    </button>
                  ))}
                  {suggestions.map((c) => (
                    <button
                      key={c.name}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        fillFromCatalog(c);
                        setSugOpen(false);
                        onToast("Filled from this studio");
                      }}
                    >
                      <span className="namesug-nm">{c.name}</span>
                      {c.classType && <span className="sub">{c.classType}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {!gym && !isEvent && isPublic && !selectedStudio && (
              <p className="durnote" style={{ marginTop: 8 }}>
                Pick a studio to see its classes.
              </p>
            )}

            {!isEvent && (
            <>
            <label className="flabel" htmlFor="fType">
              Type <span>· optional</span>
            </label>
            <select
              id="fType"
              className="typeselect"
              value={classType ?? ""}
              onChange={(e) => setClassType(e.target.value || null)}
            >
              <option value="">No type</option>
              {typeOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            </>
            )}

            <label className="flabel" htmlFor="fDesc">
              {isEvent ? (
                <>
                  Notes <span>· optional, only you see them</span>
                </>
              ) : (
                <>
                  Description <span>· optional, shown on the class page</span>
                </>
              )}
            </label>
            <textarea
              id="fDesc"
              className="abouttext"
              value={description}
              maxLength={500}
              rows={3}
              placeholder={
                isEvent
                  ? "Anything worth remembering: an address, a booking number…"
                  : "What to expect, what to bring, who it's for…"
              }
              onChange={(e) => setDescription(e.target.value)}
            />

            {/* A picture of the room, or the class. Optional forever: a
                schedule with no photos has to stay a good schedule, so this
                never becomes a field somebody has to answer. An event skips
                it; nothing renders a picture for one. */}
            {!isEvent && (
            <>
            <label className="flabel">
              Photo{" "}
              <span>
                {mineOnly
                  ? "· optional, and it goes to the studio's list with the class"
                  : "· optional, and it carries the share card"}
              </span>
            </label>
            <div className="classpho">
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="classpho-img" src={image} alt="" />
              ) : (
                <div className="classpho-img classpho-empty" aria-hidden="true">
                  <Icon name="image" size={24} />
                </div>
              )}
              <div className="classpho-acts">
                <button type="button" className="btn ghost" onClick={() => imgRef.current?.click()}>
                  {image ? "Change photo" : "Add a photo"}
                </button>
                {image && (
                  <button type="button" className="tertiary" onClick={() => setImage(null)}>
                    Remove
                  </button>
                )}
              </div>
              <input
                ref={imgRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) readPhoto(f, setImage);
                  e.target.value = "";
                }}
              />
            </div>
            </>
            )}
            </div>



            {!stepped && whenCard}

            {/* Ask people to RSVP, per the Discover brief: a save the
                organizer can see. Coaching mode only, and nothing more on
                purpose: capacity is the line that turns RSVP into a booking
                system. */}
            {!gym && !mineOnly && !isEvent && isPublic && (
              <div className="adder-card">
                <button className="setrow" onClick={() => setRsvp((v) => !v)} aria-pressed={rsvp} type="button">
                  <span className="setrow-txt">
                    <span className="t">Ask people to RSVP</span>
                    <span className="s">
                      Saves on this class show you their names, and it says so before they tap.
                    </span>
                  </span>
                  <span className={`switch${rsvp ? " on" : ""}`} aria-hidden="true">
                    <span className="switch-knob" />
                  </span>
                </button>
              </div>
            )}

            <div className="adder-card">
            <label className="flabel">
              Booking &amp; profile links <span>· paste any link, we tag it</span>
            </label>
            <div>
              {links.map((l, i) => (
                <div className="linkrow" key={i}>
                  <div className="linkfield">
                    <input
                      type="url"
                      inputMode="url"
                      placeholder="Paste a link"
                      value={l.url}
                      aria-label="Link"
                      autoCapitalize="none"
                      autoCorrect="off"
                      onChange={(e) =>
                        setLinks((prev) =>
                          prev.map((x, xi) =>
                            xi === i ? { url: e.target.value, label: detectProvider(e.target.value) } : x,
                          ),
                        )
                      }
                    />
                    {l.url.trim() && (
                      <span className="linktag">
                        <Icon name="check" size={15} /> {detectProvider(l.url)}
                      </span>
                    )}
                  </div>
                  <button
                    className="iconbtn"
                    aria-label="Remove link"
                    onClick={() => setLinks((prev) => prev.filter((_, xi) => xi !== i))}
                  >
                    <Icon name="close" size={16} />
                  </button>
                </div>
              ))}
            </div>
            <button
              className="linktoggle"
              onClick={() => setLinks((prev) => [...prev, { label: "Website", url: "" }])}
            >
              + Add link
            </button>
            </div>

            <div className="publishwrap">
              <button className="btn si" disabled={!whenChosen || pending} onClick={publish}>
                {pending ? (isEdit || isPersonalEdit ? "Saving…" : "Publishing…") : publishLabel}
              </button>
            </div>

            {(isEdit || isPersonalEdit) && (
              <div className="dangerzone">
                <button className="deletelink" onClick={() => setConfirmDelete(true)}>
                  {gym ? "Take it off the week" : isPersonalEdit ? "Remove this class" : "Delete this class"}
                </button>
              </div>
            )}
          </div>
        )}

        {stage === "pick" && (
          <div>
            {/* One flow with a name and numbered steps: the sheet says what
                it is for, and the step line says where you are in it. The
                back is the profile pages' circled arrow, beside the title;
                the first step of a fresh add has nothing behind it, so the X
                is the way out. Reopened from the form, back returns there. */}
            <div className="stephead">
              {(!stepped || name.trim() !== "" || Boolean(selectedStudio)) && (
                <button
                  className="iconbtn sheetclose stepback"
                  aria-label="Back"
                  onClick={() => setStage(stepped && !name.trim() ? "class" : "form")}
                >
                  <Icon name="arrow_back" size={20} />
                </button>
              )}
              <h2>{stepped ? "Add a class" : "Choose a studio"}</h2>
            </div>
            {stepped && <p className="stepline">Step 1 of 3 &middot; Choose the studio</p>}
            {/* The box leads and the list waits for typing: with five hundred
                studios in the directory a dumped list is a wall, and the ask
                here is three words long. Type it, tap it, move on. No
                autofocus: focusing an input the moment a sheet mounts is what
                made iOS scroll the whole page behind it to chase the caret. */}
            <div className="searchbox noicon">
              <input
                type="text"
                autoComplete="off"
                placeholder="Start typing a studio…"
                aria-label="Search studios"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {search.trim() !== "" && (
              <div className="studio-list">
                {filteredStudios.length ? (
                  filteredStudios.map((s) => (
                    <button
                      key={s.id}
                      className="studio-row"
                      onClick={() => {
                        setStudioId(s.id);
                        // Stepped, the studio's class list is the next question;
                        // re-picking from the form goes through it again, because
                        // a different studio has a different list.
                        setStage(stepped ? "class" : "form");
                      }}
                    >
                      <span>
                        <span className="nm">{s.name}</span>
                        <br />
                        <span className="ad">{s.address}</span>
                      </span>
                      {studioId === s.id && <span className="tick"><Icon name="check" size={18} /></span>}
                    </button>
                  ))
                ) : (
                  <p className="empty">
                    Nothing named &ldquo;{search.trim()}&rdquo; yet. Add it below. Takes ten seconds.
                  </p>
                )}
              </div>
            )}
            <button className="addnew" onClick={() => setStage("new")}>
              + New studio
            </button>
            <div className="dirnote">Studios are shared. Add one once and every trainer can use it.</div>
          </div>
        )}

        {/* Step two of a stepped add: the studio's own class list, whole,
            rather than hidden inside a name field's autocomplete. Picking one
            fills the details and lands on the form with only the times left
            to answer; New class lands on the same form blank. */}
        {stage === "class" && (
          <div>
            <div className="stephead">
              <button
                className="iconbtn sheetclose stepback"
                aria-label="Back"
                onClick={() => setStage("pick")}
              >
                <Icon name="arrow_back" size={20} />
              </button>
              <h2>Add a class</h2>
            </div>
            <p className="stepline">
              Step 2 of 3 &middot; Pick a class{selectedStudio ? ` at ${selectedStudio.name}` : ""}
            </p>
            <p className="lead">
              {catLoading || catalog.length > 0
                ? "Start from a class already on this studio's list, or from scratch. Yours to adjust either way."
                : "Nothing listed at this studio yet. Your class will be the first."}
            </p>
            {catLoading ? (
              <p className="empty">Looking at this studio&rsquo;s list…</p>
            ) : (
              <div className="studio-list">
                {catalog.map((c) => (
                  <button
                    key={c.name}
                    className="studio-row"
                    onClick={() => {
                      fillFromCatalog(c);
                      setStage("form");
                    }}
                  >
                    <span>
                      <span className="nm">{c.name}</span>
                      <br />
                      <span className="ad">
                        {[c.classType, c.durationMin ? `${c.durationMin} min` : null]
                          .filter(Boolean)
                          .join(" · ") || "Class"}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            <button className="addnew" onClick={() => setStage("form")}>
              + New class
            </button>
          </div>
        )}

        {stage === "new" && (
          <div>
            <div className="stephead">
              <button
                className="iconbtn sheetclose stepback"
                aria-label="Back"
                onClick={() => setStage("pick")}
              >
                <Icon name="arrow_back" size={20} />
              </button>
              <h2>New studio</h2>
            </div>
            <p className="lead">Name and address. That&rsquo;s the whole listing.</p>
            <label className="flabel" htmlFor="nsName">
              Studio name
            </label>
            <input
              type="text"
              id="nsName"
              placeholder="e.g. Palisade Barbell"
              autoComplete="off"
              value={nsName}
              onChange={(e) => setNsName(e.target.value)}
            />
            <label className="flabel" htmlFor="nsAddr">
              Address
            </label>
            <input
              type="text"
              id="nsAddr"
              placeholder="e.g. 501 Palisade Ave, Jersey City"
              autoComplete="off"
              value={nsAddr}
              onChange={(e) => setNsAddr(e.target.value)}
            />
            <div className="publishwrap" style={{ marginTop: 24 }}>
              <button
                className="btn si"
                disabled={pending || !nsName.trim() || !nsAddr.trim()}
                onClick={addStudio}
              >
                {pending ? "Adding…" : "Add studio"}
              </button>
            </div>
          </div>
        )}
      </div>

      {confirmDelete && (
        <div
          className="confirm-scrim"
          onClick={(e) => { if (e.target === e.currentTarget && !pending) setConfirmDelete(false); }}
        >
          <div className="confirm-modal" role="dialog" aria-modal="true">
            {isPersonalEdit ? (
              // One of your own: a confirm rather than an undo, because a
              // row somebody typed comes back only by typing it again.
              <>
                <h3>Remove it?</h3>
                <p>It comes off your week and your profile. It comes back only by typing it again.</p>
                <button className="btn si" disabled={pending} onClick={doDeletePersonal}>
                  {pending ? "Removing…" : "Yes, remove it"}
                </button>
              </>
            ) : occurrence ? (
              // A standing class, opened on one date. Three intentions, widest
              // last: this one day off, this weekday for good, the whole set.
              <>
                <h3>This class repeats</h3>
                <p>
                  It runs every {openedDay}
                  {repeats ? ` (and ${fmtDays(repeatDays.filter((d) => d !== prefill?.dayOfWeek))})` : ""}.
                  Taking one week off, or is it finished?
                </p>
                <button
                  className="btn si"
                  disabled={pending}
                  onClick={() => doDelete("occurrence")}
                >
                  {pending ? "Cancelling…" : `Just ${occurrenceLabel}`}
                </button>
                <button
                  className="btn ghost confirm-all"
                  disabled={pending}
                  onClick={() => doDelete("one")}
                >
                  {pending ? "Deleting…" : `Every ${openedDay}`}
                </button>
                {repeats && (
                  <button
                    className="btn ghost confirm-all"
                    disabled={pending}
                    onClick={() => doDelete("all")}
                  >
                    {pending ? "Deleting…" : `All ${repeatDays.length} days it runs`}
                  </button>
                )}
              </>
            ) : repeats ? (
              <>
                <h3>This class repeats</h3>
                <p>
                  It runs {fmtDays(repeatDays)}. Delete just {openedDay}, or every day it
                  runs? This can&rsquo;t be undone.
                </p>
                <button className="btn si" disabled={pending} onClick={() => doDelete("one")}>
                  {pending ? "Deleting…" : `Delete ${openedDay} only`}
                </button>
                <button
                  className="btn ghost confirm-all"
                  disabled={pending}
                  onClick={() => doDelete("all")}
                >
                  {pending ? "Deleting…" : `Delete all ${repeatDays.length} days`}
                </button>
              </>
            ) : (
              <>
                <h3>Delete this class?</h3>
                <p>
                  {gym
                    ? "It comes off the gym's schedule, and whoever was on it is told."
                    : "It disappears from your public page."}{" "}
                  This can&rsquo;t be undone.
                </p>
                <button className="btn si" disabled={pending} onClick={() => doDelete("one")}>
                  {pending ? "Deleting…" : "Yes, delete it"}
                </button>
              </>
            )}
            <button className="confirm-keep" disabled={pending} onClick={() => setConfirmDelete(false)}>
              Keep it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

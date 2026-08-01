"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { STUDIO_TYPES } from "@/lib/studio";
import { AVATAR_COLORS } from "@/lib/avatar";
import { fmtDateLong, RESERVED_HANDLES, slug, todayIso } from "@/lib/format";
import { getSessionUserId } from "@/lib/session";
import { normalizeLocation } from "@/lib/location";
import { knownLocations } from "@/app/actions/locations";

// Instagram: accept a handle, an @handle, or a full URL - store the bare handle.
function normalizeInstagram(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  const handle = v
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .replace(/\/.*$/, "")
    .replace(/[^A-Za-z0-9._]/g, "");
  return handle ? handle.slice(0, 40) : null;
}

// Website: accept a bare domain or full URL - store a normalized https URL.
function normalizeWebsite(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  const url = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString().slice(0, 200);
  } catch {
    return null;
  }
}

function normalizeEmail(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v.slice(0, 120) : null;
}

// Phone / WhatsApp: keep the digits, a leading +, and common separators.
function normalizePhone(raw: string): string | null {
  const v = raw.trim().replace(/[^\d+().\-\s]/g, "");
  const digits = v.replace(/\D/g, "");
  return digits.length >= 6 ? v.slice(0, 40) : null;
}

// Profile edits: name, title, about, social links, and a photo stored as a
// small data URL. The photo is resized client-side; we just guard size/format.
// Normalize a list of short chips (certs, highlights): trim, drop empties,
// cap each and the count.
function cleanChips(list: string[] | undefined, maxLen: number, maxCount: number): string[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const v = String(raw).trim().replace(/\s+/g, " ").slice(0, maxLen);
    const key = v.toLowerCase();
    if (v && !seen.has(key)) {
      seen.add(key);
      out.push(v);
    }
    if (out.length >= maxCount) break;
  }
  return out;
}

export async function updateProfile(input: {
  name: string;
  title: string;
  about: string;
  location?: string;
  certifications?: string[];
  highlights?: string[];
  disciplines?: string[];
  availability?: string | null;
  instagram: string;
  website: string;
  contactEmail?: string;
  phone?: string;
  whatsapp?: string;
  profileLinks?: { label: string; url: string }[];
  photo?: string | null; // data URL, "" to clear, undefined to leave as-is
  avatarColor?: string | null; // a pick from AVATAR_COLORS, null to go back to the derived one
}): Promise<{ ok: boolean; error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Session expired." };

  const name = input.name.trim().slice(0, 80);
  if (!name) return { ok: false, error: "Name can't be empty." };
  const title = input.title.trim().slice(0, 80);
  const about = input.about.trim().slice(0, 600);
  // One canonical "City, ST" per place, so Discover groups them as one.
  //
  // Only touched when the caller actually collected it. Passing it means the
  // form showed the field, and the field is required: Discover filters by
  // location, and a profile without one can't be found that way. Omitting it
  // means the form was about something else (contact details, say) and the
  // stored location is none of its business. It used to be written either
  // way, so saving contact info quietly cleared the coach's city.
  let location: string | null = null;
  if (input.location !== undefined) {
    const loc = normalizeLocation(input.location, await knownLocations());
    if (!loc.ok) return { ok: false, error: loc.error };
    if (!loc.value) return { ok: false, error: "Add your city, like Jersey City, NJ." };
    location = loc.value.slice(0, 80);
  }
  const instagram = normalizeInstagram(input.instagram);
  const website = normalizeWebsite(input.website);
  const contactEmail = normalizeEmail(input.contactEmail ?? "");
  const phone = normalizePhone(input.phone ?? "");
  const whatsapp = normalizePhone(input.whatsapp ?? "");

  const set: {
    name: string;
    title: string | null;
    about: string;
    location?: string | null;
    certifications?: string[];
    highlights?: string[];
    disciplines?: string[];
    availability?: string | null;
    instagram: string | null;
    website: string | null;
    contactEmail: string | null;
    phone: string | null;
    whatsapp: string | null;
    profileLinks?: { label: string; url: string }[];
    photo?: string | null;
    avatarColor?: string | null;
  } = { name, title: title || null, about, instagram, website, contactEmail, phone, whatsapp };
  if (location !== null) set.location = location;
  // Same rule as location, and for the same reason: passing a field means the
  // form collected it, omitting it means the form was about something else.
  // These three were written on every call, so saving contact info wiped a
  // coach's certifications, their What to Expect list, and their availability,
  // which also took the "Request private session" button off their page.
  if (input.certifications !== undefined) set.certifications = cleanChips(input.certifications, 40, 12);
  if (input.highlights !== undefined) set.highlights = cleanChips(input.highlights, 60, 6);
  // From the curated list only. Anything else is somebody's typo, and a filter
  // built on typos is a filter nobody can use.
  if (input.disciplines !== undefined)
    set.disciplines = [...new Set(input.disciplines)]
      .filter((d) => (STUDIO_TYPES as readonly string[]).includes(d))
      .slice(0, 4);
  if (input.availability !== undefined) {
    set.availability =
      input.availability === "accepting" || input.availability === "waitlist"
        ? input.availability
        : null;
  }
  if (input.profileLinks !== undefined) {
    // Labelled extra links: normalise the protocol, drop anything unparseable,
    // fall back to the host for a missing label, cap the list.
    const links: { label: string; url: string }[] = [];
    for (const raw of input.profileLinks.slice(0, 6)) {
      let url = (raw.url || "").trim();
      if (!url) continue;
      if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
      let host = "";
      try {
        host = new URL(url).hostname;
      } catch {
        continue;
      }
      const label = (raw.label || "").replace(/\s+/g, " ").trim().slice(0, 24) || host;
      links.push({ label, url });
    }
    set.profileLinks = links;
  }
  if (input.photo !== undefined) {
    const photo = input.photo;
    if (photo && (!photo.startsWith("data:image/") || photo.length > 900_000)) {
      return { ok: false, error: "Photo is too large. Try a smaller image." };
    }
    set.photo = photo || null;
  }
  if (input.avatarColor !== undefined) {
    // Only a colour from the palette; anything else falls back to the derived one.
    set.avatarColor = AVATAR_COLORS.includes(input.avatarColor ?? "") ? input.avatarColor : null;
  }

  const db = await getDb();
  const [user] = await db
    .update(schema.users)
    .set(set)
    .where(eq(schema.users.id, userId))
    .returning({ handle: schema.users.handle });

  revalidatePath("/app");
  if (user?.handle) revalidatePath(`/${user.handle}`);
  return { ok: true };
}

// The coach's page look — themes both their app and their public page for
// every visitor. "dark" today; more looks later.
// Opt in or out of the Find coaches directory. Their page stays public and
// shareable either way — this only controls being browsable by strangers.
// The private-account gate. Its own action, same shape as the switches
// around it in settings.
export async function setApproveFollowers(on: boolean): Promise<{ ok: boolean }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false };
  const db = await getDb();
  await db.update(schema.users).set({ approveFollowers: on }).where(eq(schema.users.id, userId));
  revalidatePath("/", "layout");
  return { ok: true };
}

// Whether the shifts a gym has this coach on show on their own public page.
// Theirs alone: a shift is their work, and whether it's listed is the same
// question as whether any of their classes are. Separate from the gym naming
// them on its schedule, which is the gym's call and stays off.
export async function setShiftsPublic(on: boolean): Promise<{ ok: boolean }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false };
  const db = await getDb();
  await db.update(schema.users).set({ shiftsPublic: on }).where(eq(schema.users.id, userId));
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setDiscoverable(on: boolean): Promise<{ ok: boolean }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false };
  const db = await getDb();
  await db.update(schema.users).set({ discoverable: on }).where(eq(schema.users.id, userId));
  revalidatePath("/app");
  revalidatePath("/discover");
  return { ok: true };
}

// Whether anyone can write to this coach from their page. Off takes the Message
// button away; threads already started stay where they are, because the coach
// turning the door off is not a reason to lose what people already said.
export async function setMessagesOpen(on: boolean): Promise<{ ok: boolean }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false };
  const db = await getDb();
  await db.update(schema.users).set({ messagesOpen: on }).where(eq(schema.users.id, userId));
  revalidatePath("/app");
  return { ok: true };
}

export async function setLook(look: string): Promise<{ ok: boolean }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false };
  const v = look === "dark" ? "dark" : null;
  const db = await getDb();
  const [user] = await db
    .update(schema.users)
    .set({ look: v })
    .where(eq(schema.users.id, userId))
    .returning({ handle: schema.users.handle });
  revalidatePath("/app");
  if (user?.handle) revalidatePath(`/${user.handle}`);
  return { ok: true };
}

// Share-image customisation. The headline caps at 28 chars so it always fits
// the story layout; the theme must be one of the curated looks.
const HEADLINE_MAX = 28;

export async function getStoryPrefs(): Promise<{
  headline: string;
  showPhoto: boolean;
  hasPhoto: boolean;
}> {
  const userId = await getSessionUserId();
  if (!userId) return { headline: "", showPhoto: true, hasPhoto: false };
  const db = await getDb();
  const [u] = await db
    .select({ storyPrefs: schema.users.storyPrefs, photo: schema.users.photo })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  return {
    headline: u?.storyPrefs?.headline ?? "",
    showPhoto: u?.storyPrefs?.showPhoto ?? true,
    hasPhoto: !!u?.photo,
  };
}

export async function setStoryPrefs(input: {
  headline?: string;
  showPhoto?: boolean;
}): Promise<{ ok: boolean }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false };
  const db = await getDb();
  const [u] = await db
    .select({ storyPrefs: schema.users.storyPrefs })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  const prefs = { ...(u?.storyPrefs ?? {}) };
  if (input.headline !== undefined) {
    const h = input.headline.replace(/\s+/g, " ").trim().slice(0, HEADLINE_MAX);
    if (h) prefs.headline = h;
    else delete prefs.headline;
  }
  if (input.showPhoto !== undefined) prefs.showPhoto = !!input.showPhoto;
  await db.update(schema.users).set({ storyPrefs: prefs }).where(eq(schema.users.id, userId));
  return { ok: true };
}


const HANDLE_CHANGE_DAYS = 90;

/** Where changing your link stands: the handle, and when it can next change. */
export async function handleStatus(): Promise<{
  handle: string | null;
  /** ISO date they can change again, or null if they can right now. */
  lockedUntil: string | null;
}> {
  const userId = await getSessionUserId();
  if (!userId) return { handle: null, lockedUntil: null };
  const db = await getDb();
  const [me] = await db
    .select({ handle: schema.users.handle, changedAt: schema.users.handleChangedAt })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (!me) return { handle: null, lockedUntil: null };
  const until = me.changedAt
    ? new Date(me.changedAt.getTime() + HANDLE_CHANGE_DAYS * 864e5)
    : null;
  return {
    handle: me.handle,
    lockedUntil: until && until.getTime() > Date.now() ? todayIso(until) : null,
  };
}

// Change the handle: the address every printed QR code and bio link points at.
// Once per 90 days, because an address that keeps moving breaks every link out
// there; the claim at signup doesn't count against it. The old handle 404s the
// moment this lands, on purpose: quietly forwarding it would mean hoarding
// every name anyone ever had.
export async function changeHandle(
  handleRaw: string,
): Promise<{ ok: boolean; handle?: string; error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Log in first." };
  const db = await getDb();
  const [me] = await db
    .select({ handle: schema.users.handle, changedAt: schema.users.handleChangedAt })
    .from(schema.users)
    .where(eq(schema.users.id, userId));
  if (!me?.handle) return { ok: false, error: "Claim your link first." };

  if (me.changedAt) {
    const until = new Date(me.changedAt.getTime() + HANDLE_CHANGE_DAYS * 864e5);
    if (until.getTime() > Date.now()) {
      return {
        ok: false,
        error: `You changed your link recently. You can change it again on ${fmtDateLong(
          todayIso(until),
        )}.`,
      };
    }
  }

  const chosen = slug(handleRaw.trim());
  if (!chosen || handleRaw.trim().length === 0)
    return { ok: false, error: "Type the link you want." };
  if (chosen === me.handle) return { ok: false, error: "That's already your link." };
  if (RESERVED_HANDLES.has(chosen)) return { ok: false, error: "That one isn't available." };
  const [taken] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.handle, chosen));
  if (taken && taken.id !== userId)
    return { ok: false, error: `fittlist.co/${chosen} is taken. Try another.` };

  await db
    .update(schema.users)
    .set({ handle: chosen, handleChangedAt: new Date() })
    .where(eq(schema.users.id, userId));
  // The handle is in every header's You tab and most cached pages.
  revalidatePath("/", "layout");
  return { ok: true, handle: chosen };
}

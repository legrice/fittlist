"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb, schema } from "@/db";
import { getSessionUserId } from "@/lib/session";

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
  availability?: string | null;
  instagram: string;
  website: string;
  contactEmail?: string;
  phone?: string;
  whatsapp?: string;
  profileLinks?: { label: string; url: string }[];
  photo?: string | null; // data URL, "" to clear, undefined to leave as-is
}): Promise<{ ok: boolean; error?: string }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: "Session expired." };

  const name = input.name.trim().slice(0, 80);
  if (!name) return { ok: false, error: "Name can't be empty." };
  const title = input.title.trim().slice(0, 80);
  const about = input.about.trim().slice(0, 600);
  const location = (input.location ?? "").trim().replace(/\s+/g, " ").slice(0, 80) || null;
  const certifications = cleanChips(input.certifications, 40, 12);
  const highlights = cleanChips(input.highlights, 60, 6);
  const availability =
    input.availability === "accepting" || input.availability === "waitlist"
      ? input.availability
      : null;
  const instagram = normalizeInstagram(input.instagram);
  const website = normalizeWebsite(input.website);
  const contactEmail = normalizeEmail(input.contactEmail ?? "");
  const phone = normalizePhone(input.phone ?? "");
  const whatsapp = normalizePhone(input.whatsapp ?? "");

  const set: {
    name: string;
    title: string | null;
    about: string;
    location: string | null;
    certifications: string[];
    highlights: string[];
    availability: string | null;
    instagram: string | null;
    website: string | null;
    contactEmail: string | null;
    phone: string | null;
    whatsapp: string | null;
    profileLinks?: { label: string; url: string }[];
    photo?: string | null;
  } = { name, title: title || null, about, location, certifications, highlights, availability, instagram, website, contactEmail, phone, whatsapp };
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
export async function setDiscoverable(on: boolean): Promise<{ ok: boolean }> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false };
  const db = await getDb();
  await db.update(schema.users).set({ discoverable: on }).where(eq(schema.users.id, userId));
  revalidatePath("/app");
  revalidatePath("/discover");
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

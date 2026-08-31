import {
  STORY_STYLES,
  STORY_THEMES,
  type StoryStyleId,
  type StoryThemeId,
} from "@/lib/format";
import { DECOS, type DecoId } from "@/lib/decorations";
import { TYPEFACES, type TypeFaceId } from "@/lib/typefaces";

/**
 * The reusable, content-independent part of the Share editor. Dates, hidden
 * classes and the headline itself remain session choices; this is the visual
 * art direction somebody can make their default or save as a named look.
 */
export type ShareDesign = {
  styleId: StoryStyleId;
  themeId: StoryThemeId;
  typeId: TypeFaceId;
  decoId: DecoId;
  headlineSize: number;
  noHead: boolean;
  useBackgroundPhoto: boolean;
  /** Horizontal and vertical focal points, as whole percentages. */
  photoX: number;
  photoY: number;
  /** Crop zoom, where 100 is cover and 300 is the closest allowed crop. */
  photoZoom: number;
  /** Darkness over a background photo, as a whole percentage. */
  overlay: number;
};

export type SavedStoryLook = {
  id: string;
  name: string;
  design: ShareDesign;
};

export const MAX_SAVED_STORY_LOOKS = 12;
export const MAX_STORY_LOOK_NAME_LENGTH = 32;

export const DEFAULT_SHARE_DESIGN: ShareDesign = Object.freeze({
  styleId: "plain",
  themeId: "paper",
  typeId: "standard",
  decoId: "top",
  headlineSize: 100,
  noHead: false,
  useBackgroundPhoto: false,
  photoX: 50,
  photoY: 50,
  photoZoom: 100,
  overlay: 24,
});

export const DEFAULT_SAVED_STORY_LOOKS: SavedStoryLook[] = [];

const STYLE_IDS = new Set(Object.keys(STORY_STYLES) as StoryStyleId[]);
const THEME_IDS = new Set(Object.keys(STORY_THEMES) as StoryThemeId[]);
const TYPE_IDS = new Set(TYPEFACES.map((typeface) => typeface.id));
const DECO_IDS = new Set(DECOS.map((deco) => deco.id));
const LOOK_ID = /^[A-Za-z0-9_-]{1,64}$/;

function recordOf(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function wholeNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function booleanOf(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/**
 * Turn database JSON, client memory or an action payload into a complete safe
 * design. Unknown and missing fields self-heal independently so adding a new
 * knob never invalidates looks saved by an older build.
 */
export function sanitizeShareDesign(
  value: unknown,
  fallback: ShareDesign = DEFAULT_SHARE_DESIGN,
): ShareDesign {
  const raw = recordOf(value);
  if (!raw) return { ...fallback };

  return {
    styleId:
      typeof raw.styleId === "string" && STYLE_IDS.has(raw.styleId as StoryStyleId)
        ? (raw.styleId as StoryStyleId)
        : fallback.styleId,
    themeId:
      typeof raw.themeId === "string" && THEME_IDS.has(raw.themeId as StoryThemeId)
        ? (raw.themeId as StoryThemeId)
        : fallback.themeId,
    typeId:
      typeof raw.typeId === "string" && TYPE_IDS.has(raw.typeId as TypeFaceId)
        ? (raw.typeId as TypeFaceId)
        : fallback.typeId,
    decoId:
      typeof raw.decoId === "string" && DECO_IDS.has(raw.decoId as DecoId)
        ? (raw.decoId as DecoId)
        : fallback.decoId,
    headlineSize: wholeNumber(raw.headlineSize, fallback.headlineSize, 60, 180),
    noHead: booleanOf(raw.noHead, fallback.noHead),
    useBackgroundPhoto: booleanOf(raw.useBackgroundPhoto, fallback.useBackgroundPhoto),
    photoX: wholeNumber(raw.photoX, fallback.photoX, 0, 100),
    photoY: wholeNumber(raw.photoY, fallback.photoY, 0, 100),
    photoZoom: wholeNumber(raw.photoZoom, fallback.photoZoom, 100, 300),
    overlay: wholeNumber(raw.overlay, fallback.overlay, 0, 60),
  };
}

/** Collapse whitespace and cap the label without inventing a name. */
export function sanitizeStoryLookName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_STORY_LOOK_NAME_LENGTH);
}

export function sanitizeStoryLookId(value: unknown): string {
  return typeof value === "string" && LOOK_ID.test(value) ? value : "";
}

export function sanitizeSavedStoryLook(value: unknown): SavedStoryLook | null {
  const raw = recordOf(value);
  if (!raw) return null;
  const id = sanitizeStoryLookId(raw.id);
  const name = sanitizeStoryLookName(raw.name);
  if (!id || !name) return null;
  return { id, name, design: sanitizeShareDesign(raw.design) };
}

/**
 * Validate persisted lists, keep their order, remove duplicate ids and cap the
 * collection. A corrupt look cannot make the whole Share editor unloadable.
 */
export function sanitizeSavedStoryLooks(value: unknown): SavedStoryLook[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const looks: SavedStoryLook[] = [];
  for (const candidate of value) {
    const look = sanitizeSavedStoryLook(candidate);
    if (!look || seen.has(look.id)) continue;
    seen.add(look.id);
    looks.push(look);
    if (looks.length >= MAX_SAVED_STORY_LOOKS) break;
  }
  return looks;
}

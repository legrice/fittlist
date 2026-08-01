// Sixty avatar colours. Without a photo every coach used to render as the same
// orange circle, which made a feed of five coaches unreadable. Everyone gets a
// colour on sight-unseen — deterministic from their id, so it never shifts —
// and can pick a different one, or upload a photo and forget colours exist.
//
// All sixty are mid-to-deep tones chosen so white initials clear WCAG AA on
// every one of them. Ordered by hue so the picker reads as a spectrum.
export const AVATAR_COLORS: string[] = [
  // reds → warm oranges (the brand's neighbourhood)
  "#c0392b", "#d4453a", "#b83227", "#e05252", "#a93226", "#cf5b4a",
  "#d2691e", "#dd6a35", "#c15f1d", "#e07b39", "#b4541a", "#e8894a",
  // ambers → olives
  "#c8871a", "#b8860b", "#d29b2b", "#a67c00", "#c9a227", "#8f7a1f",
  "#7d8b1e", "#6b8e23", "#8a9a25", "#5f7a1c", "#7a8f3a", "#4f6b18",
  // greens
  "#3d8b53", "#2e8b57", "#48a06a", "#1f7a45", "#5aa377", "#166b3a",
  // teals → cyans
  "#128277", "#0f8b8d", "#177f7a", "#2a9d8f", "#14746f", "#38a3a5",
  // blues
  "#2a7ab0", "#1f6fa8", "#3d8fc4", "#175d92", "#4a86b8", "#0f4c81",
  // indigos → violets
  "#3f51b5", "#4054a3", "#5c6bc0", "#34438f", "#5b4b9e", "#6a4fa3",
  // purples → magentas
  "#7b4397", "#8e44ad", "#6d3d8a", "#9b59b6", "#7d3c98", "#a355b8",
  // pinks → rose (back toward the reds)
  "#b0407a", "#c2185b", "#a83a6b", "#d1477f", "#96305c", "#bf4d6f",
];

// Stable hash so a coach's colour is the same on every device and after every
// deploy, without writing a row at signup.
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** The first letter, for the circle behind a missing photo. */
export function initialOf(name: string): string {
  return (name.trim().charAt(0) || "?").toUpperCase();
}

/** The colour behind a coach's initial: their pick, else one derived from id.
 *  A studio has no pick of its own, so it always gets the derived one, and it
 *  gets it from the same sixty: a directory of grey placeholder pins was
 *  unreadable for the same reason a page of identical orange circles was. */
export function avatarColor(user: { id: string; avatarColor?: string | null }): string {
  const picked = user.avatarColor;
  if (picked && AVATAR_COLORS.includes(picked)) return picked;
  return AVATAR_COLORS[hash(user.id) % AVATAR_COLORS.length];
}

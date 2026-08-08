// The poster's Font: its voice, picked by personality rather than by font
// name, by Matt's call. Nobody outside this trade knows what DM Serif
// Display is; everybody knows whether they are a news anchor.
//
// The face applies to the whole poster (Delight underneath as fallback,
// the lockup exempt: a logo does not change fonts).
//
// The files live in public/fonts, serving both sides: satori reads them
// off disk for the poster, and @font-face in globals.css shows each row
// of the picker in its own voice.

export type TypeFaceId =
  | "standard"
  | "elder"
  | "anchor"
  | "psycho"
  | "friendly"
  | "eighties"
  | "quality";

export type TypeFace = {
  id: TypeFaceId;
  /** The personality, which is the label. */
  label: string;
  /** The CSS/satori family name. */
  family: string;
  /** The file under public/fonts. Null for Delight, which is always loaded. */
  file: string | null;
};

export const TYPEFACES: TypeFace[] = [
  { id: "standard", label: "The standard", family: "Delight", file: null },
  { id: "elder", label: "Elder millennial", family: "Anybody", file: "anybody.ttf" },
  { id: "anchor", label: "News anchor", family: "DM Serif Display", file: "dm-serif-display.ttf" },
  { id: "psycho", label: "Psycho", family: "Barriecito", file: "barriecito.ttf" },
  { id: "friendly", label: "Overly friendly", family: "Bagel Fat One", file: "bagel-fat-one.ttf" },
  { id: "eighties", label: "80s kid", family: "Righteous", file: "righteous.ttf" },
  { id: "quality", label: "Quality time", family: "Young Serif", file: "young-serif.ttf" },
];

export function typeFaceOf(id: string | null | undefined): TypeFace {
  return TYPEFACES.find((t) => t.id === id) ?? TYPEFACES[0];
}

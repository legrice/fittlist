// The poster's Font: its voice, picked by personality rather than by font
// name, by Matt's call. Nobody outside this trade knows what DM Serif
// Display is; everybody knows whether they are a news anchor.
//
// The face applies to the headline only, by Matt's call (the whole-poster
// version shipped for a day and came back: the body is Delight, always,
// and the headline is where the personality lives).
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
  | "quality"
  | "anton"
  | "bebas"
  | "bungee"
  | "abril"
  | "lilita"
  | "monoton"
  | "bangers"
  | "alfa"
  | "fascinate"
  | "faster";

export type TypeFace = {
  id: TypeFaceId;
  /** The personality, which is the label. */
  label: string;
  /** The CSS/satori family name. */
  family: string;
  /** The file under public/fonts. Null for Delight, which is always loaded. */
  file: string | null;
  /** The headline leans: Elder millennial is Lora's italic. */
  italic?: boolean;
  /** Tracking in ems, for a face whose natural fit reads loose at poster
   *  size. Unset means the face's own spacing. */
  track?: number;
};

export const TYPEFACES: TypeFace[] = [
  { id: "standard", label: "The standard", family: "Delight", file: null },
  // -2% by Matt's call: Lora's italic sits loose at headline size.
  { id: "elder", label: "Elder millennial", family: "Lora", file: "lora-italic.ttf", italic: true, track: -0.02 },
  { id: "anchor", label: "News anchor", family: "DM Serif Display", file: "dm-serif-display.ttf" },
  { id: "psycho", label: "Psycho", family: "Barriecito", file: "barriecito.ttf" },
  { id: "friendly", label: "Overly friendly", family: "Bagel Fat One", file: "bagel-fat-one.ttf" },
  { id: "eighties", label: "80s kid", family: "Righteous", file: "righteous.ttf" },
  { id: "quality", label: "Quality time", family: "Young Serif", file: "young-serif.ttf" },
  { id: "anton", label: "Anton", family: "Anton", file: "anton-regular.ttf", track: -0.015 },
  { id: "bebas", label: "Bebas Neue", family: "Bebas Neue", file: "bebas-neue-regular.ttf", track: 0.01 },
  { id: "bungee", label: "Bungee", family: "Bungee", file: "bungee-regular.ttf", track: -0.02 },
  { id: "abril", label: "Abril Fatface", family: "Abril Fatface", file: "abril-fatface-regular.ttf", track: -0.015 },
  { id: "lilita", label: "Lilita One", family: "Lilita One", file: "lilita-one-regular.ttf", track: -0.01 },
  { id: "monoton", label: "Monoton", family: "Monoton", file: "monoton-regular.ttf", track: -0.01 },
  { id: "bangers", label: "Bangers", family: "Bangers", file: "bangers-regular.ttf", track: 0.01 },
  { id: "alfa", label: "Alfa Slab One", family: "Alfa Slab One", file: "alfa-slab-one-regular.ttf", track: -0.015 },
  { id: "fascinate", label: "Fascinate", family: "Fascinate", file: "fascinate-regular.ttf", track: -0.01 },
  { id: "faster", label: "Faster One", family: "Faster One", file: "faster-one-regular.ttf" },
];

export function typeFaceOf(id: string | null | undefined): TypeFace {
  return TYPEFACES.find((t) => t.id === id) ?? TYPEFACES[0];
}

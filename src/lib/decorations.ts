// The poster's Decoration: the dressing around the week, picked the way
// the Font is. Frames draw as absolute layers inside the canvas padding,
// so they cost the rows nothing; the day dividers ride the gap the day
// headings already keep, two pixels each, which the bottom padding's slack
// absorbs without the planner's sums moving.

export type DecoId = "none" | "frame" | "double" | "dividers" | "framed";

export type Deco = {
  id: DecoId;
  label: string;
};

export const DECOS: Deco[] = [
  { id: "none", label: "Clean" },
  { id: "frame", label: "Thin frame" },
  { id: "double", label: "Double frame" },
  { id: "dividers", label: "Day dividers" },
  { id: "framed", label: "Frame and dividers" },
];

export function decoOf(id: string | null | undefined): DecoId {
  return (DECOS.find((d) => d.id === id) ?? DECOS[0]).id;
}

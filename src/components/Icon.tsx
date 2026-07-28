// Material Symbols Outlined (loaded in the root layout) — the modern outline
// set, at weight 300 so strokes stay light next to Delight. Ligature-based:
// the icon name is the text content.
export function Icon({
  name,
  size = 18,
  className = "",
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <span className={`material-symbols-outlined ${className}`} style={{ fontSize: size }} aria-hidden="true">
      {name}
    </span>
  );
}

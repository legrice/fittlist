// Filled Material Icons (classic "Material Icons" font, loaded in the root
// layout). Ligature-based: the icon name is the text content.
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
    <span className={`material-icons ${className}`} style={{ fontSize: size }} aria-hidden="true">
      {name}
    </span>
  );
}

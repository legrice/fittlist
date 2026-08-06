import { brandIcon } from "@/lib/brand";

// The lockup: the block mark + "FittList". The mark wears the brand orange
// (the app icon's own colour, and the same accent the search glyph and the
// Share sparkle carry) while the text stays in the surface's ink; it was
// monochrome for a long time, and the F in ink was the one place the brand
// never showed on its own header. The cloud variant stays monochrome: on a
// dark hero the off-white lockup is the point.
export function Wordmark({
  variant = "ink",
  className = "wordmark",
  beta = false,
}: {
  variant?: "ink" | "cloud";
  className?: string;
  beta?: boolean;
}) {
  // The ink variant follows --ink so it flips with dark mode; the icon inherits
  // via currentColor. The cloud variant stays a fixed off-white on dark heroes.
  //
  // --wm-ink is the escape hatch: the colour is an inline style, which no class
  // can override, so a surface that needs a different one (the profile header,
  // floating over a photograph) sets that property on an ancestor instead of
  // this component growing a prop for every place it lands.
  const color = variant === "ink" ? "var(--wm-ink, var(--ink))" : "#F5F5F5";
  return (
    <span
      className={`wm ${className}`}
      role="img"
      aria-label={beta ? "FittList beta" : "FittList"}
      style={{ color }}
    >
      <span
        className="wm-ico"
        aria-hidden="true"
        dangerouslySetInnerHTML={{
          // --wm-mark is the same escape hatch --wm-ink is, for the F: a
          // surface floating over a photograph turns the whole lockup white
          // by setting both on an ancestor.
          __html: brandIcon(variant === "ink" ? "var(--wm-mark, var(--si))" : "currentColor"),
        }}
      />
      <span className="wm-text">FittList</span>
      {beta && <span className="wm-beta">beta</span>}
    </span>
  );
}

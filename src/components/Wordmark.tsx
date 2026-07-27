import { brandIcon } from "@/lib/brand";

// The lockup: the block mark + "FittList" in Archivo Black. Monochrome - the
// mark takes the same colour as the wordmark text (near-black on light
// surfaces, off-white on dark).
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
  const color = variant === "ink" ? "var(--ink)" : "#F5F5F5";
  return (
    <span
      className={`wm ${className}`}
      role="img"
      aria-label={beta ? "FittList beta" : "FittList"}
      style={{ color }}
    >
      <span className="wm-ico" aria-hidden="true" dangerouslySetInnerHTML={{ __html: brandIcon("currentColor") }} />
      <span className="wm-text">FittList</span>
      {beta && <span className="wm-beta">beta</span>}
    </span>
  );
}

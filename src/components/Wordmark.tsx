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
  const color = variant === "ink" ? "#191502" : "#F5F5F5";
  return (
    <span className={`wm ${className}`} role="img" aria-label={beta ? "FittList beta" : "FittList"}>
      <span className="wm-ico" aria-hidden="true" dangerouslySetInnerHTML={{ __html: brandIcon(color) }} />
      <span className="wm-text" style={{ color }}>
        FittList
      </span>
      {beta && <span className="wm-beta">beta</span>}
    </span>
  );
}

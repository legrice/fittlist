import { BRAND_ICON } from "@/lib/brand";

// The lockup: the accent-red block mark + "FittList" in Archivo Black. The
// mark stays red on both variants; only the wordmark text changes colour.
export function Wordmark({
  variant = "ink",
  className = "wordmark",
}: {
  variant?: "ink" | "cloud";
  className?: string;
}) {
  const color = variant === "ink" ? "#191502" : "#F5F5F5";
  return (
    <span className={`wm ${className}`} role="img" aria-label="FittList">
      <span className="wm-ico" aria-hidden="true" dangerouslySetInnerHTML={{ __html: BRAND_ICON }} />
      <span className="wm-text" style={{ color }}>
        FittList
      </span>
    </span>
  );
}

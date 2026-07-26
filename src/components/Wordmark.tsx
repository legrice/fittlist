import { BRAND_ICON } from "@/lib/brand";

// The lockup: the accent-red block mark + "FittList" in Archivo Black. The
// mark stays red on both variants; only the wordmark text changes colour.
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
      <span className="wm-ico" aria-hidden="true" dangerouslySetInnerHTML={{ __html: BRAND_ICON }} />
      <span className="wm-text" style={{ color }}>
        FittList
      </span>
      {beta && <span className="wm-beta">beta</span>}
    </span>
  );
}

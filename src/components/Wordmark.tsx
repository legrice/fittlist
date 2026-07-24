import { BRAND_CLOUD, BRAND_INK } from "@/lib/brand";

export function Wordmark({
  variant = "ink",
  className = "wordmark",
}: {
  variant?: "ink" | "cloud";
  className?: string;
}) {
  return (
    <div
      className={className}
      aria-label="fittlist"
      dangerouslySetInnerHTML={{ __html: variant === "ink" ? BRAND_INK : BRAND_CLOUD }}
    />
  );
}

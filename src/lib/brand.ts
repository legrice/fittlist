// The FittList mark: three descending rounded bars. It reads as both an F and
// a short list, without needing a box or a separate vertical stem.
export function brandIcon(color = "#000000"): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="${color}" aria-hidden="true"><rect width="100" height="24" rx="6"/><rect y="38" width="68" height="24" rx="6"/><rect y="76" width="36" height="24" rx="6"/></svg>`;
}

export const BRAND_ICON = brandIcon();

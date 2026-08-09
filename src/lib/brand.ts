// The fittlist mark: an "F" built from rounded blocks. Three squares stacked on
// the left, a long bar off the top and a shorter one off the middle. Pass a
// colour; defaults to warm orange for any generic use.
//
// The ink fills the viewBox exactly (0,0 to 134,136), which is what everything
// downstream relies on: make-icons.mjs centres on the viewBox middle, and the
// header lockup sizes the mark by its box. Keep it flush if the shapes change,
// or the mark drifts off-centre inside its orange square.
export function brandIcon(color = "#C2410C"): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 134 136" fill="${color}" aria-hidden="true"><rect width="40" height="40" rx="4" ry="4"/><rect x="48" width="86" height="40" rx="4" ry="4"/><rect y="48" width="40" height="40" rx="4" ry="4"/><rect x="48" y="48" width="46" height="40" rx="4" ry="4"/><rect y="96" width="40" height="40" rx="4" ry="4"/></svg>`;
}

export const BRAND_ICON = brandIcon();

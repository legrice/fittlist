// The fittlist mark: an "F" built from rounded blocks - three stacked on the
// left, a long bar off the top and a medium bar off the middle. Pass a colour;
// defaults to warm orange for any generic use.
export function brandIcon(color = "#dd6a35"): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 112 100" fill="${color}" aria-hidden="true"><rect x="2" y="4" width="30" height="24" rx="7"/><rect x="40" y="4" width="56" height="24" rx="7"/><rect x="2" y="38" width="30" height="24" rx="7"/><rect x="40" y="38" width="35" height="24" rx="7"/><rect x="2" y="72" width="30" height="24" rx="7"/></svg>`;
}

export const BRAND_ICON = brandIcon();

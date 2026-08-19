// The fittlist mark: an "F" built from rounded blocks. This geometry mirrors
// the supplied New Logo.svg exactly; the former mark was slightly wider and
// used uneven middle blocks.
//
// The ink fills the viewBox exactly (0,0 to 100,100), which is what everything
// downstream relies on: make-icons.mjs centres on the viewBox middle, and the
// header lockup sizes the mark by its box. Keep it flush if the shapes change.
export function brandIcon(color = "#000000"): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="${color}" aria-hidden="true"><rect width="30" height="30" rx="3.07989"/><rect x="35" width="65" height="30" rx="3.07989"/><rect y="35" width="30" height="30" rx="3.07989"/><rect x="35" y="35" width="30" height="30" rx="3.07989"/><rect y="70" width="30" height="30" rx="3.07989"/></svg>`;
}

export const BRAND_ICON = brandIcon();

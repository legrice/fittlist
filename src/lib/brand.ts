// The FittList mark: three descending rounded bars. It reads as both an F and
// a short list, without needing a box or a separate vertical stem.
export function brandIcon(color = "#020D08"): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 103" fill="${color}" aria-hidden="true"><rect width="108" height="27" rx="4"/><rect y="38" width="72" height="27" rx="4"/><rect y="76" width="36" height="27" rx="4"/></svg>`;
}

export const BRAND_ICON = brandIcon();

// Keep the social identity in one place. Share prompts and future exported
// captions should never have to repeat (or retype) the account name.
export const INSTAGRAM_HANDLE = "@fittlist";
export const INSTAGRAM_URL = "https://www.instagram.com/fittlist/";

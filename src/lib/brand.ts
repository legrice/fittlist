// The FittList mark: three descending rounded bars. It reads as both an F and
// a short list, without needing a box or a separate vertical stem.
export function brandIcon(color = "#020D08"): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="53.7961 53.0371 103.2039 98.4259" fill="${color}" aria-hidden="true"><path d="M53.7961 63.1551C53.7961 57.5671 58.3261 53.0371 63.9142 53.0371H155.988C156.547 53.0371 157 53.4901 157 54.0489V70.7436C157 75.214 153.376 78.838 148.906 78.838H54.8079C54.2491 78.838 53.7961 78.385 53.7961 77.8262V63.1551Z"/><path d="M53.7961 99.4675C53.7961 93.8795 58.3261 89.3495 63.9142 89.3495H121.587C122.146 89.3495 122.599 89.8025 122.599 90.3613V107.056C122.599 111.526 118.975 115.15 114.504 115.15H54.8079C54.2491 115.15 53.7961 114.697 53.7961 114.139V99.4675Z"/><path d="M53.7961 135.78C53.7961 130.192 58.3261 125.662 63.9142 125.662H87.1856C87.7444 125.662 88.1974 126.115 88.1974 126.674V143.369C88.1974 147.839 84.5734 151.463 80.103 151.463H54.8079C54.2491 151.463 53.7961 151.01 53.7961 150.451V135.78Z"/></svg>`;
}

export const BRAND_ICON = brandIcon();

// Keep the social identity in one place. Share prompts and future exported
// captions should never have to repeat (or retype) the account name.
export const INSTAGRAM_HANDLE = "@fittlist";
export const INSTAGRAM_URL = "https://www.instagram.com/fittlist/";

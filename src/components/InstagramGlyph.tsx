// Material Icons is a ligature font with no brand marks, so the Instagram
// glyph is a small inline SVG (camera square + lens + flash dot).
export function InstagramGlyph({ size = 18, app = false }: { size?: number; app?: boolean }) {
  if (app) {
    return (
      <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
        <defs>
          <radialGradient id="instagram-app-gradient" cx="30%" cy="100%" r="125%">
            <stop offset="0" stopColor="#ffd600" />
            <stop offset=".45" stopColor="#ff0169" />
            <stop offset="1" stopColor="#7638fa" />
          </radialGradient>
        </defs>
        <rect width="48" height="48" rx="14" fill="url(#instagram-app-gradient)" />
        <rect x="11" y="11" width="26" height="26" rx="8" fill="none" stroke="#fff" strokeWidth="3.2" />
        <circle cx="24" cy="24" r="6.2" fill="none" stroke="#fff" strokeWidth="3.2" />
        <circle cx="32.5" cy="15.7" r="2" fill="#fff" />
      </svg>
    );
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.6" cy="6.4" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

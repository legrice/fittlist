// The onboarding hero illustration: a boutique coach with their coaching life -
// studios, a weekly calendar, a synced Google event, a private client, socials
// and a location - all flowing into one shareable phone profile. Self-contained
// SVG (prefixed ids) injected on the login screen. Warm neutrals + sparing
// accent orange to match the app.
export const ONBOARDING_HERO = `<svg viewBox="0 0 400 236" xmlns="http://www.w3.org/2000/svg" width="100%" role="img" aria-label="A coach with their studios, classes and profile in one place">
  <defs>
    <linearGradient id="flhbg" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="#fdfbf5"/><stop offset="1" stop-color="#efe6d3"/></linearGradient>
    <radialGradient id="flhglow" cx="0.37" cy="0.52" r="0.55"><stop offset="0" stop-color="#f6d6bd" stop-opacity="0.8"/><stop offset="1" stop-color="#f6d6bd" stop-opacity="0"/></radialGradient>
    <filter id="flhsoft" x="-40%" y="-40%" width="180%" height="200%"><feDropShadow dx="0" dy="5" stdDeviation="7" flood-color="#4a3a12" flood-opacity="0.15"/></filter>
    <filter id="flhsoftsm" x="-60%" y="-60%" width="220%" height="220%"><feDropShadow dx="0" dy="3" stdDeviation="4.5" flood-color="#4a3a12" flood-opacity="0.14"/></filter>
    <clipPath id="flhphone"><rect x="288" y="46" width="94" height="164" rx="17"/></clipPath>
  </defs>
  <rect x="0" y="0" width="400" height="236" rx="26" fill="url(#flhbg)"/>
  <rect x="0.75" y="0.75" width="398.5" height="234.5" rx="25.25" fill="none" stroke="#eee3cf" stroke-width="1.5"/>
  <ellipse cx="150" cy="142" rx="140" ry="118" fill="url(#flhglow)"/>
  <g stroke="#d6cbb1" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="0.5 6" fill="none" opacity="0.9">
    <path d="M92 78 C116 98, 128 106, 146 118"/>
    <path d="M226 62 C204 84, 182 100, 160 116"/>
    <path d="M92 176 C112 162, 130 150, 148 138"/>
    <path d="M248 152 C212 142, 188 132, 162 126"/>
    <path d="M276 112 C232 122, 196 124, 166 124"/>
  </g>
  <g filter="url(#flhsoft)"><rect x="18" y="30" width="104" height="70" rx="12" fill="#fff"/></g>
  <text x="30" y="49" font-family="Sora,sans-serif" font-size="8" font-weight="700" letter-spacing="1.2" fill="#a89f88">THIS WEEK</text>
  <g fill="#efe8d9"><rect x="30" y="58" width="9" height="30" rx="3"/><rect x="43" y="58" width="9" height="30" rx="3"/><rect x="56" y="58" width="9" height="30" rx="3"/><rect x="69" y="58" width="9" height="30" rx="3"/><rect x="82" y="58" width="9" height="30" rx="3"/><rect x="95" y="58" width="9" height="30" rx="3"/><rect x="108" y="58" width="9" height="30" rx="3"/></g>
  <rect x="30" y="58" width="9" height="12" rx="3" fill="#191502"/><rect x="56" y="64" width="9" height="15" rx="3" fill="#dd6a35"/><rect x="69" y="58" width="9" height="10" rx="3" fill="#191502"/><rect x="95" y="70" width="9" height="12" rx="3" fill="#191502"/><rect x="108" y="60" width="9" height="15" rx="3" fill="#dd6a35"/>
  <g filter="url(#flhsoftsm)"><rect x="170" y="24" width="110" height="42" rx="12" fill="#fff"/></g>
  <rect x="170" y="24" width="5" height="42" rx="2.5" fill="#4285F4"/>
  <text x="186" y="42" font-family="Sora,sans-serif" font-size="8.5" font-weight="700" fill="#191502">6:30a &#183; Base Gym</text>
  <text x="186" y="55" font-family="Sora,sans-serif" font-size="7.5" fill="#9a917b">Synced to Google Calendar</text>
  <g filter="url(#flhsoftsm)"><rect x="24" y="158" width="94" height="30" rx="15" fill="#fff"/></g>
  <circle cx="41" cy="173" r="8" fill="#eadfcb"/>
  <text x="41" y="176" font-family="Sora,sans-serif" font-size="7.5" font-weight="800" fill="#8a805f" text-anchor="middle">Y6</text>
  <text x="55" y="176.5" font-family="Sora,sans-serif" font-size="9" font-weight="700" fill="#191502">YogaSix</text>
  <g filter="url(#flhsoftsm)"><rect x="150" y="184" width="118" height="34" rx="12" fill="#fff"/></g>
  <circle cx="167" cy="201" r="9" fill="#f7e6d6"/>
  <path d="M167 197.4a2.3 2.3 0 100 4.6 2.3 2.3 0 000-4.6zm-4 7.8c0-2.3 1.8-3.4 4-3.4s4 1.1 4 3.4z" fill="#dd6a35"/>
  <text x="182" y="198" font-family="Sora,sans-serif" font-size="8.5" font-weight="700" fill="#191502">Private Client</text>
  <text x="182" y="210" font-family="Sora,sans-serif" font-size="7.5" fill="#9a917b">12:00 PM</text>
  <g filter="url(#flhsoftsm)"><circle cx="248" cy="152" r="15" fill="#fff"/></g>
  <path d="M248 144c-3.6 0-6.5 2.9-6.5 6.5 0 4.6 6.5 10.5 6.5 10.5s6.5-5.9 6.5-10.5c0-3.6-2.9-6.5-6.5-6.5z" fill="#dd6a35"/>
  <circle cx="248" cy="150.5" r="2.3" fill="#fff"/>
  <g filter="url(#flhsoftsm)"><circle cx="270" cy="108" r="14" fill="#fff"/></g>
  <rect x="262" y="100" width="16" height="16" rx="5" fill="none" stroke="#191502" stroke-width="1.7"/>
  <circle cx="270" cy="108" r="3.4" fill="none" stroke="#191502" stroke-width="1.7"/>
  <circle cx="274.4" cy="103.6" r="1.1" fill="#191502"/>
  <g>
    <ellipse cx="150" cy="212" rx="40" ry="7.5" fill="#d6cbb1" opacity="0.5"/>
    <g transform="rotate(-18 118 150)"><rect x="103" y="141" width="33" height="15" rx="7.5" fill="#dd6a35"/><ellipse cx="105" cy="148.5" rx="3.6" ry="7.5" fill="#c85a29"/></g>
    <path d="M135 150 q-4 30 -6 52 h11 q3 -26 7 -44 q4 18 7 44 h11 q-2 -22 -6 -52 z" fill="#2c2a26"/>
    <rect x="126" y="200" width="15" height="7" rx="3.5" fill="#dd6a35"/><rect x="159" y="200" width="15" height="7" rx="3.5" fill="#dd6a35"/>
    <path d="M129 96 q21 -8 42 0 q4 30 -2 56 q-19 7 -38 0 q-6 -26 -2 -56 z" fill="#e9e0cf"/>
    <path d="M131 98 q-9 22 -8 44 q4 3 8 1 q3 -22 8 -40 z" fill="#e2ac84"/>
    <path d="M169 98 q9 22 6 42 q-4 3 -8 1 q-2 -22 -8 -40 z" fill="#e2ac84"/>
    <rect x="145" y="84" width="10" height="10" rx="4" fill="#e2ac84"/>
    <circle cx="150" cy="72" r="15" fill="#e2ac84"/>
    <path d="M134 76 Q133 57 150 57 Q167 57 166 76 Q166 68 158 65 Q150 63 142 65 Q134 68 134 76 Z" fill="#42342b"/>
    <circle cx="150" cy="55" r="6" fill="#42342b"/>
  </g>
  <g filter="url(#flhsoft)"><rect x="288" y="46" width="94" height="164" rx="17" fill="#fff"/></g>
  <g clip-path="url(#flhphone)">
    <rect x="288" y="46" width="94" height="164" fill="#fff"/>
    <text x="300" y="70" font-family="Sora,sans-serif" font-size="10" font-weight="800" fill="#191502">Matt LeGrice</text>
    <text x="300" y="81" font-family="Sora,sans-serif" font-size="7.5" fill="#9a917b">Strength &#183; Mobility</text>
    <line x1="300" y1="89" x2="371" y2="89" stroke="#efe8d9" stroke-width="1"/>
    <text x="300" y="102" font-family="Sora,sans-serif" font-size="7" font-weight="700" letter-spacing="0.8" fill="#a89f88">TODAY</text>
    <g font-family="Sora,sans-serif" font-size="8">
      <text x="300" y="116" font-weight="700" fill="#dd6a35">6:30a</text><text x="326" y="116" fill="#3a352a">Base Gym</text>
      <text x="300" y="131" font-weight="700" fill="#dd6a35">12:00</text><text x="326" y="131" fill="#3a352a">Private</text>
      <text x="300" y="146" font-weight="700" fill="#dd6a35">6:00p</text><text x="326" y="146" fill="#3a352a">YogaSix</text>
    </g>
    <rect x="300" y="156" width="71" height="16" rx="8" fill="#dd6a35"/>
    <text x="335.5" y="167" font-family="Sora,sans-serif" font-size="7.5" font-weight="800" fill="#fff" text-anchor="middle">Book a session</text>
    <rect x="300" y="178" width="33.5" height="14" rx="7" fill="#f4efe1"/>
    <text x="316.75" y="188" font-family="Sora,sans-serif" font-size="7" font-weight="700" fill="#6b6555" text-anchor="middle">Insta</text>
    <rect x="337.5" y="178" width="33.5" height="14" rx="7" fill="#f4efe1"/>
    <text x="354.25" y="188" font-family="Sora,sans-serif" font-size="7" font-weight="700" fill="#6b6555" text-anchor="middle">Web</text>
  </g>
</svg>`;

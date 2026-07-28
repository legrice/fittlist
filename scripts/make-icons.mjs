// Rasterise the app mark into the PNGs a home-screen install needs.
//
// One-off: the output is committed to public/. Run it again only if the mark
// changes. Playwright is already a dev dependency, so no image toolchain.
//
//   node scripts/make-icons.mjs
import { chromium } from "playwright";
import fs from "node:fs";

const INK = "#191502";
const PAPER = "#faf8f2";
const ORANGE = "#DD583A";

/** The four bars, drawn to fill a 120 box. `scale` shrinks them inside it. */
const mark = (scale) => `
  <g transform="translate(60 60) scale(${scale}) translate(-60 -60)">
    <rect x="18" y="20" width="36" height="22" rx="11" fill="${PAPER}"/>
    <rect x="62" y="20" width="40" height="22" rx="11" fill="${PAPER}"/>
    <rect x="18" y="49" width="66" height="22" rx="11" fill="${ORANGE}"/>
    <rect x="18" y="78" width="28" height="22" rx="11" fill="${PAPER}"/>
  </g>`;

// A plain icon may use its whole square; a maskable one gets cropped to a
// circle on Android, so the mark shrinks into the safe zone and the ink runs
// to the edge. An Apple touch icon is masked by iOS, so it's full-bleed too.
const ICONS = [
  { file: "icon-192.png", size: 192, radius: 27, scale: 0.72 },
  { file: "icon-512.png", size: 512, radius: 27, scale: 0.72 },
  { file: "icon-192-maskable.png", size: 192, radius: 0, scale: 0.55 },
  { file: "icon-512-maskable.png", size: 512, radius: 0, scale: 0.55 },
  { file: "apple-touch-icon.png", size: 180, radius: 0, scale: 0.66 },
];

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
for (const { file, size, radius, scale } of ICONS) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="${size}" height="${size}">
    <rect width="120" height="120" rx="${radius}" fill="${INK}"/>${mark(scale)}</svg>`;
  const page = await browser.newPage({
    viewport: { width: size, height: size },
    deviceScaleFactor: 1,
  });
  await page.setContent(
    `<body style="margin:0;background:transparent">${svg}</body>`,
    { waitUntil: "load" },
  );
  await page.screenshot({ path: `public/${file}`, omitBackground: radius > 0 });
  await page.close();
  console.log(`public/${file}  ${size}x${size}`);
}
await browser.close();
console.log(`\n${ICONS.length} icons written`);
if (!fs.existsSync("public/icon-512.png")) throw new Error("icons missing");

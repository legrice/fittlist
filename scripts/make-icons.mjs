// Rasterise the app mark into the PNGs a home-screen install needs.
//
// The geometry comes from brandIcon() rather than a copy of it, so the icon on
// a home screen can't drift from the mark in the header. That means running it
// through tsx, since brand.ts is TypeScript:
//
//   npx tsx scripts/make-icons.mjs
//
// The output is committed. Run it again only when the mark itself changes.
import { chromium } from "playwright";
import fs from "node:fs";
import { brandIcon } from "../src/lib/brand.ts";

const ORANGE = "#C2410C"; // --si, the accent the whole app is built around
const WHITE = "#ffffff";

// brandIcon's ink fills its 134x136 viewBox exactly, so the centre is the box
// centre. Scale by the larger side, so the mark fits its share of the square in
// both directions; `fill` is how much of the 120 box it takes up.
const INK = { cx: 67, cy: 68, w: 136 };
function square(size, radius, fill) {
  // brandIcon carries its colour on the <svg> element, which is exactly the
  // part being unwrapped, so the group has to carry it instead.
  const inner = brandIcon(WHITE)
    .replace(/^<svg[^>]*>/, "")
    .replace(/<\/svg>$/, "");
  const scale = fill / INK.w;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="${size}" height="${size}">
    <rect width="120" height="120" rx="${radius}" fill="${ORANGE}"/>
    <g fill="${WHITE}" transform="translate(60 60) scale(${scale}) translate(${-INK.cx} ${-INK.cy})">${inner}</g>
  </svg>`;
}

// A plain icon may use its whole square. A maskable one gets cropped to
// whatever shape the launcher likes, so its mark pulls into the safe zone and
// the orange runs to the edge. An Apple touch icon is masked by iOS too, but
// only ever to a rounded square, so it can sit closer to the edge.
const ICONS = [
  { file: "icon-192.png", size: 192, radius: 27, fill: 66 },
  { file: "icon-512.png", size: 512, radius: 27, fill: 66 },
  { file: "icon-192-maskable.png", size: 192, radius: 0, fill: 52 },
  { file: "icon-512-maskable.png", size: 512, radius: 0, fill: 52 },
  { file: "apple-touch-icon.png", size: 180, radius: 0, fill: 62 },
];

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
for (const { file, size, radius, fill } of ICONS) {
  const page = await browser.newPage({
    viewport: { width: size, height: size },
    deviceScaleFactor: 1,
  });
  await page.setContent(
    `<body style="margin:0;background:transparent">${square(size, radius, fill)}</body>`,
    { waitUntil: "load" },
  );
  await page.screenshot({ path: `public/${file}`, omitBackground: radius > 0 });
  await page.close();
  console.log(`public/${file}  ${size}x${size}`);
}

// The browser favicon: same mark, same source, so the tab matches the app.
fs.writeFileSync("src/app/icon.svg", `${square(120, 27, 66).replace(/\n\s+/g, "")}\n`);
console.log("src/app/icon.svg");

await browser.close();
if (!fs.existsSync("public/icon-512.png")) throw new Error("icons missing");
console.log(`\n${ICONS.length + 1} written`);

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

const LIME = "#9FE870";
const INK_COLOR = "#020D08";

// brandIcon's ink fills its 108x103 viewBox exactly, so the centre is the box
// centre. Scale by the larger side, so the mark fits its share of the square in
// both directions; `fill` is how much of the 120 box it takes up.
const INK = { cx: 54, cy: 51.5, w: 108 };
function square(size, radius, fill) {
  // brandIcon carries its colour on the <svg> element, which is exactly the
  // part being unwrapped, so the group has to carry it instead.
  const inner = brandIcon(LIME)
    .replace(/^<svg[^>]*>/, "")
    .replace(/<\/svg>$/, "");
  const scale = fill / INK.w;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="${size}" height="${size}">
    <rect width="120" height="120" rx="${radius}" fill="${INK_COLOR}"/>
    <g fill="${LIME}" transform="translate(60 60) scale(${scale}) translate(${-INK.cx} ${-INK.cy})">${inner}</g>
  </svg>`;
}

// A plain icon uses the reference's large lime mark on its dark field. A
// maskable one gets cropped to whatever shape the launcher likes, so its mark
// pulls into the safe zone. Apple touch applies its own rounded-square mask.
const ICONS = [
  { file: "icon-192.png", size: 192, radius: 0, fill: 79.2 },
  { file: "icon-512.png", size: 512, radius: 0, fill: 79.2 },
  { file: "icon-192-maskable.png", size: 192, radius: 0, fill: 64 },
  { file: "icon-512-maskable.png", size: 512, radius: 0, fill: 64 },
  { file: "apple-touch-icon.png", size: 180, radius: 0, fill: 79.2 },
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
fs.writeFileSync("src/app/icon.svg", `${square(120, 0, 79.2).replace(/\n\s+/g, "")}\n`);
console.log("src/app/icon.svg");

await browser.close();
if (!fs.existsSync("public/icon-512.png")) throw new Error("icons missing");
console.log(`\n${ICONS.length + 1} written`);

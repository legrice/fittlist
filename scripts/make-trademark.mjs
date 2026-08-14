// The mark, drawn big and clean for a trademark filing.
//
//   node scripts/make-trademark.mjs
//
// Writes into brand/. USPTO wants a JPG between 250x250 and 944x944 pixels
// showing the mark and nothing else, so these are 944 on their long side, on
// plain white, with no beta tag, no strapline and no padding beyond a small
// even margin. Black and white is the safe filing: a colour drawing claims the
// colour as part of the mark, which narrows what it covers.
//
// Four files, because a filing usually wants one and a lawyer usually asks for
// the others: the lockup and the mark alone, each in black and in brand orange.
import { chromium } from "playwright";
import { mkdir, readFile } from "node:fs/promises";
import { brandIcon } from "../src/lib/brand.ts";

const OUT = new URL("../brand/", import.meta.url).pathname;
await mkdir(OUT, { recursive: true });

const font = await readFile(new URL("../public/fonts/delight-700.woff2", import.meta.url));
const fontUrl = `data:font/woff2;base64,${font.toString("base64")}`;

const page = async (b, html, w, h) => {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await p.setContent(html);
  await p.evaluate(() => document.fonts.ready);
  return p;
};

const shell = (body, w, h) => `<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face { font-family: 'Delight'; src: url('${fontUrl}') format('woff2'); font-weight: 700; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${w}px; height: ${h}px; background: #fff; }
  body { display: flex; align-items: center; justify-content: center; }
  .wm { display: inline-flex; align-items: center; gap: .32em; line-height: 1; }
  .wm-ico { display: block; height: .76em; flex-shrink: 0; }
  .wm-ico svg { height: 100%; width: auto; display: block; }
  .wm-text { font-family: 'Delight'; font-weight: 700; font-size: 1em; letter-spacing: -.02em; white-space: nowrap; }
</style></head><body>${body}</body></html>`;

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

// The lockup: mark and word together, the way it appears on the product. The
// em size is what sets the drawing's height; 944 wide with an even margin.
for (const [name, color] of [
  ["fittlist-lockup-black", "#111111"],
  ["fittlist-lockup-color", "#C2410C"],
]) {
  const w = 944;
  const h = 300;
  const html = shell(
    `<span class="wm" style="color:${color};font-size:150px">
       <span class="wm-ico">${brandIcon("currentColor")}</span>
       <span class="wm-text">FittList</span>
     </span>`,
    w,
    h,
  );
  const p = await page(b, html, w, h);
  await p.screenshot({ path: `${OUT}${name}.jpg`, type: "jpeg", quality: 100 });
  await p.close();
  console.log(`${name}.jpg  ${w}x${h}`);
}

// The mark on its own, square, for an icon-only filing or an app listing.
for (const [name, color] of [
  ["fittlist-mark-black", "#111111"],
  ["fittlist-mark-color", "#C2410C"],
]) {
  const s = 944;
  const html = shell(
    `<span style="color:${color};display:block;width:620px">${brandIcon("currentColor")}</span>
     <style>svg { width: 100%; height: auto; display: block; }</style>`,
    s,
    s,
  );
  const p = await page(b, html, s, s);
  await p.screenshot({ path: `${OUT}${name}.jpg`, type: "jpeg", quality: 100 });
  await p.close();
  console.log(`${name}.jpg  ${s}x${s}`);
}

await b.close();

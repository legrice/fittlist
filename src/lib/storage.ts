import { createHash } from "node:crypto";
import { put } from "@vercel/blob";

/**
 * Where a picked picture actually lives.
 *
 * Photos have always been data URLs in text columns, which was the right
 * first shape (no infrastructure, one column, works everywhere) and has the
 * two costs that finally caught up with it: every list row that joins a
 * user drags a 150 to 300KB string along, and one stored size has to serve
 * both a 26px by-line circle and a 1170-device-pixel hero.
 *
 * This is the way out, built to change nothing until it can: `storeImage`
 * uploads to Vercel Blob and hands back the file's URL when a store is
 * configured (BLOB_READ_WRITE_TOKEN, one click in the Vercel dashboard),
 * and hands the data URL straight back when one isn't, or when the upload
 * fails. An <img src> takes either, so dev, the suites and a prod without
 * the token keep working exactly as before, and old rows keep rendering
 * until their photo is re-picked. Nothing anywhere deletes a photo on
 * upload failure.
 *
 * The name is the content's own hash, so re-saving the same picture writes
 * the same file rather than a growing pile of copies.
 */
export async function storeImage(
  dataUrl: string | null | undefined,
  prefix: string,
): Promise<string | null> {
  if (!dataUrl) return dataUrl ?? null;
  // Already a URL (an unchanged photo round-tripping through an editor, or
  // a row saved before this existed): pass it through untouched.
  if (!dataUrl.startsWith("data:image/")) return dataUrl;
  if (!process.env.BLOB_READ_WRITE_TOKEN) return dataUrl;
  const m = dataUrl.match(/^data:(image\/[a-z+.-]+);base64,(.+)$/s);
  if (!m) return dataUrl;
  try {
    const buf = Buffer.from(m[2], "base64");
    const ext = m[1] === "image/png" ? "png" : m[1] === "image/webp" ? "webp" : "jpg";
    const hash = createHash("sha256").update(buf).digest("hex").slice(0, 20);
    const { url } = await put(`${prefix}/${hash}.${ext}`, buf, {
      access: "public",
      contentType: m[1],
      addRandomSuffix: false,
      // The same picture re-saved is the same file: don't error on it.
      allowOverwrite: true,
    });
    return url;
  } catch {
    return dataUrl;
  }
}

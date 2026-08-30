// One resize, for every picture somebody picks.
//
// The profile editor, the setup wizard, a member's editor and the studio
// editor each carried an identical copy of this, and a class photo would have
// been the fifth. Four copies of a thing that decides how big every image in
// the database is, drifting apart quietly, is how one screen starts storing
// 3MB while the others store 40KB.
//
// Photos live in text columns as data URLs, so the size here is the size on
// the row. 640 was chosen when a photo was a circle; the full-bleed hero is
// ~1170 device pixels wide on a 3x phone. A portrait capped at 1280 on its
// long edge can be only 720px wide, so even a high-resolution original still
// looked soft after our resize. 2304 keeps the short edge of common portrait
// ratios large enough for the hero while Blob keeps that file out of list
// queries. Pictures uploaded before this stay at their old size until picked
// again.
const MAX_EDGE = 2304;
const QUALITY = 0.86;
// The picture travels through a 3MB server action before Blob stores it. Keep
// enough room for the rest of the form and the action envelope. This is a
// character count because a data URL is ASCII inside the JSON request.
const DATA_URL_LIMIT = 2_200_000;
/* The list size. A by-line circle is 26px and the tray's faces are 80: a
   480 thumb covers the largest profile circles on a high-density screen and
   keeps a
   row from dragging the hero's full file along. */
const THUMB_EDGE = 480;
const THUMB_QUALITY = 0.82;

type DecodedPhoto = {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
};

type EncodedJpeg =
  | { kind: "blob"; blob: Blob }
  | { kind: "data-url"; dataUrl: string };

function imageFromUrl(src: string, cleanup: () => void = () => {}): Promise<DecodedPhoto> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      cleanup();
      resolve({
        source: img,
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
        release: () => {
          img.onload = null;
          img.onerror = null;
          img.src = "";
        },
      });
    };
    img.onerror = () => {
      cleanup();
      reject(new Error("Photo could not be decoded"));
    };
    try {
      img.src = src;
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

function fileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Photo could not be read"));
    reader.readAsDataURL(file);
  });
}

async function decodeFile(file: File): Promise<DecodedPhoto> {
  // ImageBitmap decodes off the main interaction path in supporting browsers
  // and, unlike a FileReader data URL, does not create a second base64 copy of
  // a multi-megabyte original. Some Safari/image-format combinations still
  // reject it, so an object URL remains the compatibility path below.
  if (typeof globalThis.createImageBitmap === "function") {
    try {
      const bitmap = await globalThis.createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // Safari can display formats its ImageBitmap decoder does not accept.
    }
  }

  if (typeof URL.createObjectURL === "function") {
    const objectUrl = URL.createObjectURL(file);
    return imageFromUrl(objectUrl, () => URL.revokeObjectURL(objectUrl));
  }

  // Older embedded web views without object URLs keep the original FileReader
  // route. It is intentionally last because it temporarily duplicates the
  // complete source file in memory.
  return imageFromUrl(await fileAsDataUrl(file));
}

function encodeJpeg(canvas: HTMLCanvasElement, quality: number): Promise<EncodedJpeg> {
  if (typeof canvas.toBlob !== "function") {
    return Promise.resolve({ kind:"data-url", dataUrl:canvas.toDataURL("image/jpeg", quality) });
  }

  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve({ kind:"blob", blob });
          return;
        }
        // A few older Safari builds can return null instead of throwing. Keep
        // their synchronous encoder as a narrow fallback, not the normal path.
        try {
          resolve({ kind:"data-url", dataUrl:canvas.toDataURL("image/jpeg", quality) });
        } catch (error) {
          reject(error);
        }
      }, "image/jpeg", quality);
    } catch (error) {
      reject(error);
    }
  });
}

function encodedDataUrlLength(encoded: EncodedJpeg): number {
  if (encoded.kind === "data-url") return encoded.dataUrl.length;
  const prefix = `data:${encoded.blob.type || "image/jpeg"};base64,`.length;
  return prefix + 4 * Math.ceil(encoded.blob.size / 3);
}

function blobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Photo could not be encoded"));
    reader.readAsDataURL(blob);
  });
}

async function encodedDataUrl(encoded: EncodedJpeg): Promise<string> {
  return encoded.kind === "data-url" ? encoded.dataUrl : blobAsDataUrl(encoded.blob);
}

async function scaleTo(
  photo: DecodedPhoto,
  maxEdge: number,
  quality: number,
  dataUrlLimit = DATA_URL_LIMIT,
): Promise<string> {
  let { width, height } = photo;
  if (width > height && width > maxEdge) {
    height = (height * maxEdge) / width;
    width = maxEdge;
  } else if (height > maxEdge) {
    width = (width * maxEdge) / height;
    height = maxEdge;
  }
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Photo canvas is unavailable");

  const draw = (nextWidth: number, nextHeight: number) => {
    canvas.width = Math.max(1, Math.round(nextWidth));
    canvas.height = Math.max(1, Math.round(nextHeight));
    context.drawImage(photo.source, 0, 0, canvas.width, canvas.height);
  };

  try {
    draw(width, height);

    // Detailed phone photos can exceed the request limit even after their
    // dimensions are sensible. Preserve those dimensions and step JPEG
    // quality down first. Blob size lets rejected attempts avoid allocating a
    // second base64 string; only the accepted result is converted to a URL.
    const qualities = [quality, 0.8, 0.74, 0.68, 0.62];
    let encoded = await encodeJpeg(canvas, qualities[0]);
    if (encodedDataUrlLength(encoded) <= dataUrlLimit) return encodedDataUrl(encoded);
    for (const nextQuality of qualities.slice(1)) {
      encoded = await encodeJpeg(canvas, nextQuality);
      if (encodedDataUrlLength(encoded) <= dataUrlLimit) return encodedDataUrl(encoded);
    }

    // If noise still wins, redraw from the decoded source into the same canvas
    // at progressively smaller dimensions. This avoids retaining a chain of
    // copy canvases while preserving the old 0.85 / 0.68 fallback behavior.
    while (encodedDataUrlLength(encoded) > dataUrlLimit && Math.max(canvas.width, canvas.height) > 640) {
      width = canvas.width * 0.85;
      height = canvas.height * 0.85;
      draw(width, height);
      encoded = await encodeJpeg(canvas, 0.68);
    }

    // At the established 640px floor a JPEG should be comfortably below both
    // limits. Keep shrinking only as a safety valve for pathological encoders;
    // never return a payload larger than the Server Action accepts.
    while (encodedDataUrlLength(encoded) > dataUrlLimit && Math.max(canvas.width, canvas.height) > 160) {
      width = canvas.width * 0.85;
      height = canvas.height * 0.85;
      draw(width, height);
      encoded = await encodeJpeg(canvas, 0.62);
    }
    if (encodedDataUrlLength(encoded) > dataUrlLimit) throw new Error("Photo is too large to upload");
    return encodedDataUrl(encoded);
  } finally {
    // Clearing dimensions releases the backing pixel buffer promptly. This is
    // especially important when a profile pair creates a full image and thumb
    // from the same decoded source on memory-constrained iPhones.
    canvas.width = 1;
    canvas.height = 1;
  }
}

/** Read a picked file into two sizes: the full picture for the hero and
 *  the cards, and a small one for every list circle. User photos only; a
 *  class or studio picture renders big everywhere it renders. */
export function readPhotoPair(
  file: File,
  onDone: (full: string, thumb: string) => void,
  onError?: () => void,
): void {
  void (async () => {
    let photo: DecodedPhoto | null = null;
    let full: string;
    let thumb: string;
    try {
      photo = await decodeFile(file);
      // Run sequentially: two large canvas encoders in parallel briefly double
      // peak memory and make Safari more likely to discard one of them.
      full = await scaleTo(photo, MAX_EDGE, QUALITY);
      thumb = await scaleTo(photo, THUMB_EDGE, THUMB_QUALITY);
      photo.release();
      photo = null;
    } catch {
      photo?.release();
      onError?.();
      return;
    }
    onDone(full, thumb);
  })();
}

/** Shrink an already-read data URL: the member editor crops its own square
 *  first, and its thumb is a shrink of that crop. */
export function shrinkDataUrl(dataUrl: string, onDone: (thumb: string) => void): void {
  void (async () => {
    let photo: DecodedPhoto | null = null;
    let thumb: string;
    try {
      photo = await imageFromUrl(dataUrl);
      thumb = await scaleTo(photo, THUMB_EDGE, THUMB_QUALITY);
      photo.release();
      photo = null;
    } catch {
      // This API historically had no error callback; preserve that contract.
      photo?.release();
      return;
    }
    onDone(thumb);
  })();
}

/** Read a picked file, scale it down, and hand back a JPEG data URL. */
export function readPhoto(file: File, onDone: (dataUrl: string) => void, onError?: () => void): void {
  void (async () => {
    let photo: DecodedPhoto | null = null;
    let result: string;
    try {
      photo = await decodeFile(file);
      result = await scaleTo(photo, MAX_EDGE, QUALITY);
      photo.release();
      photo = null;
    } catch {
      photo?.release();
      onError?.();
      return;
    }
    onDone(result);
  })();
}

/** Group covers do not need the much larger source used by full profile
 * heroes. Keeping this request below 700KB leaves ample room in the Server
 * Action envelope on every deployment path, while 1600px is still crisp on
 * a high-density phone. */
export function readGroupPhoto(file: File, onDone: (dataUrl: string) => void, onError?: () => void): void {
  void (async () => {
    let photo: DecodedPhoto | null = null;
    let result: string;
    try {
      photo = await decodeFile(file);
      result = await scaleTo(photo, 1600, 0.82, 700_000);
      photo.release();
      photo = null;
    } catch {
      photo?.release();
      onError?.();
      return;
    }
    onDone(result);
  })();
}

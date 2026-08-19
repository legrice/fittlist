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

function scaleTo(img: HTMLImageElement, maxEdge: number, quality: number, dataUrlLimit = DATA_URL_LIMIT): string {
  let { width, height } = img;
  if (width > height && width > maxEdge) {
    height = (height * maxEdge) / width;
    width = maxEdge;
  } else if (height > maxEdge) {
    width = (width * maxEdge) / height;
    height = maxEdge;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width);
  canvas.height = Math.round(height);
  const context = canvas.getContext("2d");
  context?.drawImage(img, 0, 0, canvas.width, canvas.height);

  // Detailed phone photos can exceed the request limit even after their
  // dimensions are sensible. Preserve those dimensions and step JPEG quality
  // down first; only reduce pixels if an unusually noisy image still needs it.
  let result = canvas.toDataURL("image/jpeg", quality);
  for (const nextQuality of [0.8, 0.74, 0.68, 0.62]) {
    if (result.length <= dataUrlLimit) return result;
    result = canvas.toDataURL("image/jpeg", nextQuality);
  }
  // One short edge used to stop this loop even while a panoramic or highly
  // detailed photo was still too large. That let an oversized Server Action
  // request escape the picker and Next replaced the page with a digest error
  // before the action could answer. Keep shrinking the long edge until the
  // payload actually satisfies the advertised ceiling.
  while (result.length > dataUrlLimit && Math.max(canvas.width, canvas.height) > 640) {
    const copy = document.createElement("canvas");
    copy.width = Math.round(canvas.width * 0.85);
    copy.height = Math.round(canvas.height * 0.85);
    copy.getContext("2d")?.drawImage(canvas, 0, 0, copy.width, copy.height);
    canvas.width = copy.width;
    canvas.height = copy.height;
    canvas.getContext("2d")?.drawImage(copy, 0, 0);
    result = canvas.toDataURL("image/jpeg", 0.68);
  }
  return result;
}

/** Read a picked file into two sizes: the full picture for the hero and
 *  the cards, and a small one for every list circle. User photos only; a
 *  class or studio picture renders big everywhere it renders. */
export function readPhotoPair(
  file: File,
  onDone: (full: string, thumb: string) => void,
  onError?: () => void,
): void {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => onDone(scaleTo(img, MAX_EDGE, QUALITY), scaleTo(img, THUMB_EDGE, THUMB_QUALITY));
    img.onerror = () => onError?.();
    img.src = reader.result as string;
  };
  reader.onerror = () => onError?.();
  reader.readAsDataURL(file);
}

/** Shrink an already-read data URL: the member editor crops its own square
 *  first, and its thumb is a shrink of that crop. */
export function shrinkDataUrl(dataUrl: string, onDone: (thumb: string) => void): void {
  const img = new Image();
  img.onload = () => onDone(scaleTo(img, THUMB_EDGE, THUMB_QUALITY));
  img.src = dataUrl;
}

/** Read a picked file, scale it down, and hand back a JPEG data URL. */
export function readPhoto(file: File, onDone: (dataUrl: string) => void, onError?: () => void): void {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => onDone(scaleTo(img, MAX_EDGE, QUALITY));
    img.onerror = () => onError?.();
    img.src = reader.result as string;
  };
  reader.onerror = () => onError?.();
  reader.readAsDataURL(file);
}

/** Group covers do not need the much larger source used by full profile
 * heroes. Keeping this request below 700KB leaves ample room in the Server
 * Action envelope on every deployment path, while 1600px is still crisp on
 * a high-density phone. */
export function readGroupPhoto(file: File, onDone: (dataUrl: string) => void, onError?: () => void): void {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => onDone(scaleTo(img, 1600, 0.82, 700_000));
    img.onerror = () => onError?.();
    img.src = reader.result as string;
  };
  reader.onerror = () => onError?.();
  reader.readAsDataURL(file);
}

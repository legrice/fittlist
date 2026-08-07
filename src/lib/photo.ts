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
// ~1170 device pixels wide on a 3x phone, and 640 stretched across that is
// why every profile read soft. 1280 lands around 150 to 300KB a photo, which
// is the accepted cost until photos move out of the rows into real files;
// pictures uploaded before this stay at 640 until they are re-picked.
const MAX_EDGE = 1280;
const QUALITY = 0.8;
/* The list size. A by-line circle is 26px and the tray's faces are 80: a
   320 thumb covers every small rendering at 3x, and it is what keeps a
   row from dragging the hero's full file along. */
const THUMB_EDGE = 320;
const THUMB_QUALITY = 0.75;

function scaleTo(img: HTMLImageElement, maxEdge: number, quality: number): string {
  let { width, height } = img;
  if (width > height && width > maxEdge) {
    height = (height * maxEdge) / width;
    width = maxEdge;
  } else if (height > maxEdge) {
    width = (width * maxEdge) / height;
    height = maxEdge;
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")?.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

/** Read a picked file into two sizes: the full picture for the hero and
 *  the cards, and a small one for every list circle. User photos only; a
 *  class or studio picture renders big everywhere it renders. */
export function readPhotoPair(
  file: File,
  onDone: (full: string, thumb: string) => void,
): void {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => onDone(scaleTo(img, MAX_EDGE, QUALITY), scaleTo(img, THUMB_EDGE, THUMB_QUALITY));
    img.src = reader.result as string;
  };
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
export function readPhoto(file: File, onDone: (dataUrl: string) => void): void {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > height && width > MAX_EDGE) {
        height = (height * MAX_EDGE) / width;
        width = MAX_EDGE;
      } else if (height > MAX_EDGE) {
        width = (width * MAX_EDGE) / height;
        height = MAX_EDGE;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")?.drawImage(img, 0, 0, width, height);
      onDone(canvas.toDataURL("image/jpeg", QUALITY));
    };
    img.src = reader.result as string;
  };
  reader.readAsDataURL(file);
}

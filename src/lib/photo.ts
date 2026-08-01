// One resize, for every picture somebody picks.
//
// The profile editor, the setup wizard, a member's editor and the studio
// editor each carried an identical copy of this, and a class photo would have
// been the fifth. Four copies of a thing that decides how big every image in
// the database is, drifting apart quietly, is how one screen starts storing
// 3MB while the others store 40KB.
//
// Photos live in text columns as data URLs, so the size here is the size on
// the row: 640px on the long edge at 82% JPEG lands around 40 to 80KB, small
// enough to sit in a row and sharp enough to fill a phone's width.
const MAX_EDGE = 640;
const QUALITY = 0.82;

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

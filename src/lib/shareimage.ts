/**
 * Handing a generated image to the phone.
 *
 * Three sheets draw a poster and every one of them hands it on the same way,
 * so the awkward part lives here once rather than three times.
 *
 * The awkward part is this: a web page cannot write to the camera roll. There
 * is no API for it and there is not going to be one. On iOS the only way into
 * Photos is the system share sheet, where "Save Image" is one of the rows.
 *
 * There was a Save button next to Share for a build. It had to open that same
 * sheet to reach Photos at all, so it was one act wearing two buttons, and the
 * sheet already offers saving as one of its rows. One button now, and the
 * choice of what to do with the picture belongs to the sheet.
 *
 * Where the browser cannot hand over a file at all, which in practice means a
 * desktop, this falls back to a download.
 *
 * The day this is wrapped as a native app, a real save-to-Photos exists. If a
 * Save button ever comes back, that is what it should call, and this is the
 * one place to add it.
 */

/** Whether the browser can hand a real file to the operating system. */
export function canShareFiles(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function"
  );
}

/** Pull the rendered PNG down as a file the OS will accept. */
async function fetchImage(url: string, fileName: string): Promise<File> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`image ${res.status}`);
  return new File([await res.blob()], fileName, { type: "image/png" });
}

/** The last resort, and the right answer on a desktop: put it in Downloads. */
function download(url: string, fileName: string): void {
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
}

/**
 * Returns false only when something actually went wrong, so a caller can say
 * so. A person dismissing the share sheet is not a failure and reports true.
 */
export async function putImage(url: string, fileName: string): Promise<boolean> {
  try {
    if (canShareFiles()) {
      const file = await fetchImage(url, fileName);
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
        return true;
      }
    }
    // No share sheet to open, which is a desktop. A download is the only way
    // to hand the picture on there, and it is the right one.
    download(url, fileName);
    return true;
  } catch (e) {
    // Dismissing the sheet throws AbortError, and that is somebody changing
    // their mind rather than anything being broken.
    if ((e as Error)?.name === "AbortError") return true;
    return false;
  }
}

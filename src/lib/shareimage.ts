/**
 * Handing a generated image to the phone.
 *
 * Three sheets draw a poster and every one of them offers the same two acts,
 * so the awkward part lives here once rather than three times.
 *
 * The awkward part is this: a web page cannot write to the camera roll. There
 * is no API for it and there is not going to be one. On iOS the only way into
 * Photos is the system share sheet, where "Save Image" is one of the rows, so
 * Save has to open that sheet and let the person take the last step. A
 * download link, which is what Save used to be, lands the file in Files and
 * nowhere near the camera roll, which is not where anybody meant to put a
 * picture of their week.
 *
 * So Share and Save open the same sheet on a phone and differ only in intent.
 * That reads like a duplicate and is not one: they are two different things to
 * want, the sheet is genuinely the way to do both, and offering only Share
 * would leave somebody who wants the picture in their camera roll with no
 * obvious road. Where the browser cannot hand over a file at all (desktop,
 * mostly) Save falls back to a download, which is the right answer there.
 *
 * The day this is wrapped as a native app, a real save-to-Photos exists and
 * `save` should use it. That is the one line to change.
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

export type PutMode = "share" | "save";

/**
 * Returns false only when something actually went wrong, so a caller can say
 * so. A person dismissing the share sheet is not a failure and reports true.
 */
export async function putImage(
  url: string,
  fileName: string,
  mode: PutMode,
): Promise<boolean> {
  try {
    if (canShareFiles()) {
      const file = await fetchImage(url, fileName);
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
        return true;
      }
    }
    // No share sheet to open. For Share this is the only way to hand the
    // picture on at all, and for Save it is exactly what was wanted.
    download(url, fileName);
    return true;
  } catch (e) {
    // Dismissing the sheet throws AbortError, and that is somebody changing
    // their mind rather than anything being broken.
    if ((e as Error)?.name === "AbortError") return true;
    return false;
  }
}

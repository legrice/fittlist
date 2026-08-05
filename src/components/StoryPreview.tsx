"use client";

import { useState } from "react";

// The poster, never shown half-drawn.
//
// `ImageResponse` generates the PNG while the body streams, and Satori takes
// 200 to 400ms for a week on a fast machine, more on a phone and more again
// with a photo embedded. Safari paints a partial PNG as the bytes land, so
// for the whole of that the preview was the top inch of a poster with a line
// of text sliced in half and nothing underneath, which reads as broken rather
// than as loading.
//
// So the image is only revealed once it has fully loaded, and until then the
// last one that did stays up as the wrapper's background. Changing a control
// now redraws the poster rather than dismantling it: the previous week sits
// there until the new one is whole. On the very first draw there is nothing
// to hold, so the ground is the poster's own paper and it reads as a page
// waiting to be printed.
//
// The `src` attribute is always current, deliberately. Holding it back until
// the load finished would be the tidier-looking fix and would make every
// assertion that reads it after moving a control race against a render.
export function StoryPreview({
  src,
  alt,
  /** The chosen theme's paper, so an empty wait is the poster's own ground
   *  rather than a slab of some other colour. */
  bg,
}: {
  src: string;
  alt: string;
  bg: string;
}) {
  const [shown, setShown] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const ready = shown === src;

  return (
    <span
      className="storyimg-wrap"
      style={{
        backgroundColor: bg,
        // Only while a new one is on its way: once it lands the image itself
        // is what you are looking at, and a copy behind it is dead weight.
        backgroundImage: shown && !ready ? `url("${shown}")` : undefined,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="storyimg"
        src={src}
        alt={alt}
        style={{ opacity: ready ? 1 : 0 }}
        onLoad={() => {
          setFailed(false);
          setShown(src);
        }}
        // A render that failed leaves the paper up forever otherwise, which
        // is a lie told quietly. Say it instead.
        onError={() => setFailed(true)}
      />
      {failed && <span className="storyimg-err">Couldn&rsquo;t draw that one</span>}
    </span>
  );
}

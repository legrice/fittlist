import { ImageResponse } from "next/og";
import QRCode from "qrcode";
import { brandIcon } from "@/lib/brand";

// One paint behind every QR code, the way cardimage is behind every card:
// the profile route and the join route draw the same picture from a
// different target, and the F mark in the middle has to sit identically on
// both or they read as two apps.
//
// The mark rides a white rounded square in the centre, by Matt's call: the
// code was the one branded surface leaving the app with nothing of the
// brand on it. Error correction goes to H (30%) because the badge covers
// modules; at 212px of 1024 it hides about 4% of the image, a fifth of
// what H absorbs, so the code scans with margin to spare. Change the badge
// size and check that arithmetic in the same commit.
const SIZE = 1024;
const BADGE = 212;
// The mark's viewBox is 134x136, so width leads and height follows it.
const MARK_W = 118;
const MARK_H = Math.round((MARK_W * 136) / 134);

export async function brandedQr(
  target: string,
  palette: "light" | "dark-green" | "slate" = "light",
): Promise<ImageResponse> {
  const darkGreen = palette !== "light";
  const background = palette === "slate" ? "#111F24" : darkGreen ? "#1F5B3A" : "#ffffff";
  const foreground = darkGreen ? "#ffffff" : "#191502";
  const qrDataUrl = await QRCode.toDataURL(target, {
    type: "image/png",
    width: SIZE,
    margin: 2,
    errorCorrectionLevel: "H",
    color: { dark: foreground, light: background },
  });
  const markDataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(brandIcon(foreground))}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: SIZE,
          height: SIZE,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrDataUrl}
          width={SIZE}
          height={SIZE}
          style={{ position: "absolute", top: 0, left: 0 }}
          alt=""
        />
        <div
          style={{
            width: BADGE,
            height: BADGE,
            background,
            borderRadius: 40,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={markDataUrl} width={MARK_W} height={MARK_H} alt="" />
        </div>
      </div>
    ),
    {
      width: SIZE,
      height: SIZE,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600",
      },
    },
  );
}

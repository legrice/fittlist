import { NextResponse } from "next/server";

type PhotonFeature = {
  properties?: {
    name?: string;
    housenumber?: string;
    street?: string;
    city?: string;
    district?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
};

function labelFor(feature: PhotonFeature) {
  const p = feature.properties ?? {};
  const street = [p.housenumber, p.street].filter(Boolean).join(" ") || p.name;
  return [street, p.city || p.district, p.state, p.postcode].filter(Boolean).join(", ");
}

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 3 || q.length > 160) return NextResponse.json({ suggestions: [] });

  const params = new URLSearchParams({ q, limit: "5", lang: "en", lat: "40.7178", lon: "-74.0431" });
  params.append("layer", "house");
  params.append("layer", "street");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch(`https://photon.komoot.io/api/?${params}`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
      next: { revalidate: 3600 },
    });
    if (!response.ok) return NextResponse.json({ suggestions: [] });
    const data = await response.json() as { features?: PhotonFeature[] };
    const suggestions = [...new Set((data.features ?? []).map(labelFor).filter(Boolean))].slice(0, 5);
    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json({ suggestions: [] });
  } finally {
    clearTimeout(timeout);
  }
}

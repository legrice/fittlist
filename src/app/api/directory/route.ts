import { NextRequest, NextResponse } from "next/server";
import { discoverGroups, discoverPeople, discoverStudios } from "@/app/actions/discover";
import { searchDirectory } from "@/app/actions/search";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

/** Authenticated reads reuse the same visibility and block rules as the app. */
export async function GET(request: NextRequest) {
  try {
    return await readDirectory(request);
  } catch {
    return NextResponse.json({ error: "Directory temporarily unavailable" }, { status: 503, headers });
  }
}

async function readDirectory(request: NextRequest) {
  if (!await getSessionUserId()) return NextResponse.json({ error: "Sign in required" }, { status: 401, headers });
  const params = request.nextUrl.searchParams;
  const kind = params.get("kind");
  if (kind === "search") {
    const query = params.get("q") ?? "";
    if (query.length > 200) return NextResponse.json({ error: "Query too long" }, { status: 400, headers });
    return NextResponse.json(await searchDirectory(query), { headers });
  }
  if (!["people", "places", "groups"].includes(kind ?? "")) return NextResponse.json({ error: "Unknown directory" }, { status: 400, headers });
  const miles = params.has("miles") ? Number(params.get("miles")) : undefined;
  const center = params.has("lat") || params.has("lng")
    ? { lat: Number(params.get("lat")), lng: Number(params.get("lng")) } : undefined;
  if ((miles !== undefined && (!Number.isFinite(miles) || miles <= 0 || miles > 100)) ||
      (center && (!params.has("lat") || !params.has("lng") || !Number.isFinite(center.lat) || !Number.isFinite(center.lng) || Math.abs(center.lat) > 90 || Math.abs(center.lng) > 180))) {
    return NextResponse.json({ error: "Invalid location" }, { status: 400, headers });
  }
  const data = kind === "people" ? await discoverPeople(miles, center)
    : kind === "places" ? await discoverStudios(miles, center) : await discoverGroups(miles, center);
  return NextResponse.json(data, { headers });
}

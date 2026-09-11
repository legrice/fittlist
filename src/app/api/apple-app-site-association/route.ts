import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Apple fetches this through the extensionless .well-known rewrite. */
export function GET() {
  // Public identifier verified against the signed FittList iOS archive.
  // Keep the website association available without deployment-only setup.
  const teamId = process.env.APPLE_TEAM_ID?.trim() || "58MG79EU7S";
  if (!teamId || !/^[A-Z0-9]{10}$/.test(teamId)) {
    return NextResponse.json(
      { error: "APPLE_TEAM_ID is not configured" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json(
    {
      webcredentials: { apps: [`${teamId}.co.fittlist.app`] },
      applinks: {
        apps: [],
        details: [
          {
            appID: `${teamId}.co.fittlist.app`,
            components: [
              { "/": "/api/google/*", exclude: true, comment: "Keep OAuth cookies in the initiating browser" },
              { "/": "/connect/google", exclude: true, comment: "Browser-based Google Calendar setup" },
              { "/": "/*", comment: "Open FittList links in the app" },
            ],
          },
        ],
      },
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300",
        "Content-Type": "application/json",
      },
    },
  );
}

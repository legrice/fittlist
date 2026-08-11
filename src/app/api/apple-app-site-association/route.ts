import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Apple fetches this through the extensionless .well-known rewrite. */
export function GET() {
  const teamId = process.env.APPLE_TEAM_ID?.trim();
  return NextResponse.json(
    {
      applinks: {
        apps: [],
        details: teamId
          ? [
              {
                appID: `${teamId}.co.fittlist.app`,
                components: [{ "/": "/*", comment: "Open all FittList links in the app" }],
              },
            ]
          : [],
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

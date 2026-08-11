import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Lets profile, place and class links open directly in the installed iOS app.
 * APPLE_TEAM_ID becomes available after Apple finishes the organization setup;
 * until then the endpoint stays valid but advertises no app association.
 */
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

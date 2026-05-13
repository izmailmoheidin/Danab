import { NextResponse } from "next/server";

import { getEnrichedStations } from "@/lib/server/station-registry";

export async function GET() {
  try {
    const stations = await getEnrichedStations();
    return NextResponse.json(
      { stations, fetchedAt: new Date().toISOString() },
      {
        status: 200,
        headers: { "Cache-Control": "private, no-store, max-age=0" },
      },
    );
  } catch (err) {
    console.error(
      "Failed to fetch mobile stations:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { error: "Failed to fetch mobile stations" },
      { status: 500 },
    );
  }
}

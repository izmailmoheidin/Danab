import { NextRequest, NextResponse } from "next/server";
import { updateStationStats } from "@/lib/stationStatsJob";
import { cacheComponent } from "@/lib/cacheComponent";

const QUIET_START_HOUR = 2; // 2:00 AM UTC+3
const QUIET_END_HOUR = 7; // 7:00 AM UTC+3

function getNowUTC3() {
  const now = new Date();
  return new Date(now.getTime() + 3 * 60 * 60 * 1000);
}

function isQuietHours(): boolean {
  const hour = getNowUTC3().getUTCHours();
  return hour >= QUIET_START_HOUR && hour < QUIET_END_HOUR;
}

export async function GET(req: NextRequest) {
  const CRON_SECRET = process.env.CRON_SECRET;

  if (CRON_SECRET) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Quiet hours check (2 AM – 7 AM UTC+3)
  if (isQuietHours()) {
    const nowUtc3 = getNowUTC3();
    console.log(
      `😴 Quiet hours (${QUIET_START_HOUR}:00–${QUIET_END_HOUR}:00 UTC+3), current: ${nowUtc3.getUTCHours()}:${String(
        nowUtc3.getUTCMinutes(),
      ).padStart(2, "0")} — skipping station update`,
    );
    return NextResponse.json({
      message: "Skipped: quiet hours (02:00–07:00 UTC+3)",
      timestamp: new Date().toISOString(),
    });
  }

  try {
    console.log("⏱️ Cron: Updating all station stats...");
    const result = await updateStationStats();
    cacheComponent.invalidatePrefix("stations:stats:");
    return NextResponse.json({
      message: "All station stats updated",
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("❌ Cron station stats error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";

export async function GET() {
  const checks = {
    FIREBASE_CREDENTIALS_B64: {
      present: !!process.env.FIREBASE_CREDENTIALS_B64,
      length: process.env.FIREBASE_CREDENTIALS_B64?.length || 0,
    },
    HEYCHARGE_API_KEY: {
      present: !!process.env.HEYCHARGE_API_KEY,
      length: process.env.HEYCHARGE_API_KEY?.length || 0,
    },
    HEYCHARGE_DOMAIN: {
      present: !!process.env.HEYCHARGE_DOMAIN,
      value: process.env.HEYCHARGE_DOMAIN || null,
    },
    WAAFI_API_KEY: {
      present: !!process.env.WAAFI_API_KEY,
      length: process.env.WAAFI_API_KEY?.length || 0,
    },
    WAAFI_URL: {
      present: !!process.env.WAAFI_URL,
      value: process.env.WAAFI_URL || null,
    },
    STATION_58_IMEI: process.env.STATION_58_IMEI || null,
    STATION_59_IMEI: process.env.STATION_59_IMEI || null,
    STATION_60_IMEI: process.env.STATION_60_IMEI || null,
    STATION_61_IMEI: process.env.STATION_61_IMEI || null,
    STATION_62_IMEI: process.env.STATION_62_IMEI || null,
    NODE_ENV: process.env.NODE_ENV || null,
    VERCEL: process.env.VERCEL || null,
  };

  let firebaseStatus = "not_tested";
  try {
    const { getDb } = await import("@/lib/server/firebase-admin");
    const db = getDb();
    const snap = await db.collection("stations").limit(1).get();
    firebaseStatus = `ok (found ${snap.size} stations)`;
  } catch (err: any) {
    firebaseStatus = `error: ${err.message}`;
  }

  return NextResponse.json({
    envChecks: checks,
    firebaseStatus,
    timestamp: new Date().toISOString(),
  });
}

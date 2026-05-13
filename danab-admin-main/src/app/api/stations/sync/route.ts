import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/firebase-admin";
import { authenticateRequest, requireRole, TokenPayload } from "@/lib/auth";
import { writeAuditLog } from "@/lib/auditLog";
import axios from "axios";

export async function POST(req: NextRequest) {
  const auth = authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth as TokenPayload;

  const roleCheck = requireRole(user, ["admin"]);
  if (roleCheck) return roleCheck;

  try {
    const apiKey = process.env.HEYCHARGE_API_KEY;
    const domain = process.env.HEYCHARGE_DOMAIN || "https://openapi.heycharge.global";

    if (!apiKey) {
      return NextResponse.json({ error: "HEYCHARGE_API_KEY is not configured" }, { status: 500 });
    }

    // 1. Fetch live stations from HeyCharge
    const hcResponse = await axios.get(`${domain}/api/v1/station/list`, {
      headers: { "X-Api-Key": apiKey }
    });

    const hcStations = hcResponse.data?.data?.list || [];
    if (!Array.isArray(hcStations)) {
      return NextResponse.json({ error: "Invalid response from HeyCharge API" }, { status: 502 });
    }

    // 2. Get existing stations from Firestore to avoid duplicates
    const existingSnap = await db.collection("stations").get();
    const existingImeis = new Set(existingSnap.docs.map(doc => doc.data().imei));

    let addedCount = 0;
    const now = new Date();

    // 3. Add new stations
    const batch = db.batch();
    for (const hcStation of hcStations) {
      if (!existingImeis.has(hcStation.imei)) {
        const newStationRef = db.collection("stations").doc();
        batch.set(newStationRef, {
          imei: hcStation.imei,
          name: hcStation.stationName || `Station ${hcStation.imei}`,
          iccid: hcStation.iccid || "",
          location: hcStation.address || "Imported from HeyCharge",
          totalSlots: hcStation.totalSlots || 0,
          isAutoSynced: true,
          createdAt: now,
          updatedAt: now
        });
        addedCount++;
      }
    }

    if (addedCount > 0) {
      await batch.commit();
      await writeAuditLog({
        req,
        actor: user,
        action: "stations.sync",
        targetType: "station",
        targetId: "heycharge_sync",
        targetLabel: "HeyCharge Bulk Sync",
        after: { addedCount }
      });
    }

    return NextResponse.json({
      message: `Sync complete! Found ${hcStations.length} stations. Added ${addedCount} new ones. ✅`,
      addedCount
    });
  } catch (error: any) {
    console.error("Station sync error:", error);
    return NextResponse.json(
      { error: "Failed to sync stations: " + (error.response?.data?.message || error.message) },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/firebase-admin";
import { admin } from "@/lib/firebase-admin";
import { authenticateRequest, requireRole, TokenPayload } from "@/lib/auth";
import { getTrustedRentalPhone, hasRentalPhoneMismatch } from "@/lib/activeRentals";
import { loadOfficialActiveRentals } from "@/lib/batteryState";
import { cacheComponent, buildPrivateCacheControl } from "@/lib/cacheComponent";
import { RENTALS_COLLECTION } from "@/lib/rentalsCollection";

const CACHE_TTL_MS = 20_000;

export async function GET(req: NextRequest) {
  const auth = authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;
  const roleCheck = requireRole(auth as TokenPayload, [
    "user",
    "moderator",
    "admin",
  ]);
  if (roleCheck) return roleCheck;

  try {
    const enrichedRentals = await cacheComponent.remember(
      "transactions:latest",
      CACHE_TTL_MS,
      async () => {
        const Timestamp = admin.firestore.Timestamp;
        const twoDaysAgo = Timestamp.fromDate(
          new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        );

        const rentalsSnapshot = await db
          .collection(RENTALS_COLLECTION)
          .where("status", "in", ["rented", "returned"])
          .where("timestamp", ">=", twoDaysAgo)
          .orderBy("timestamp", "desc")
          .limit(30)
          .get();

        const rentals = rentalsSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        const officialActiveRows = await loadOfficialActiveRentals();

        if (rentals.length === 0 && officialActiveRows.length === 0) {
          return [];
        }

        const imeis = Array.from(
          new Set(
            [...rentals, ...officialActiveRows]
              .map((r: any) => r.imei)
              .filter(Boolean),
          ),
        );

        const stationSnapshot =
          imeis.length > 0
            ? await db.collection("stations").where("imei", "in", imeis).get()
            : { forEach: (_fn: any) => {} };

        const stationMap: Record<string, string> = {};
        stationSnapshot.forEach((doc) => {
          const data = doc.data();
          stationMap[data.imei] = data.name || null;
        });

        const enriched = rentals.map((r: any) => ({
          ...r,
          phoneNumber: getTrustedRentalPhone(r),
          phoneNumberMismatch: hasRentalPhoneMismatch(r),
          stationName: stationMap[r.imei] || null,
        }));

        const returnedRows = enriched.filter((r: any) => {
          const normalizedStatus = String(r.status || "").toLowerCase();
          return normalizedStatus === "returned" || normalizedStatus === "completed";
        });
        const enrichedOfficialActiveRows = officialActiveRows.map((r: any) => ({
          ...r,
          phoneNumber: getTrustedRentalPhone(r),
          phoneNumberMismatch: hasRentalPhoneMismatch(r),
          stationName: stationMap[r.imei] || null,
        }));

        return [...enrichedOfficialActiveRows, ...returnedRows]
          .sort((a: any, b: any) => {
            const aSeconds = Number(a?.timestamp?._seconds || 0);
            const bSeconds = Number(b?.timestamp?._seconds || 0);
            return bSeconds - aSeconds;
          })
          .slice(0, 10);
      },
    );

    return NextResponse.json(enrichedRentals, {
      headers: {
        "Cache-Control": buildPrivateCacheControl(CACHE_TTL_MS),
      },
    });
  } catch (error: any) {
    console.error("❌ Error fetching latest rentals:", error);
    return NextResponse.json(
      { error: "Failed to fetch enriched rentals ❌" },
      { status: 500 },
    );
  }
}

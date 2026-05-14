import { NextResponse } from "next/server";
import db, { admin } from "@/lib/firebase-admin";

export async function GET() {
  try {
    // Get Firebase app info
    const app = admin.apps[0];
    const appOptions = app?.options;
    const projectId =
      (appOptions?.credential as any)?.projectId ||
      (appOptions?.projectId as string) ||
      "unknown";

    // Check system_users collection
    const usersSnap = await db.collection("system_users").limit(5).get();
    const users = usersSnap.docs.map((doc) => ({
      id: doc.id,
      username: doc.data().username,
      role: doc.data().role,
      email: doc.data().email,
    }));

    // Check stations collection
    const stationsSnap = await db.collection("stations").limit(5).get();
    const stations = stationsSnap.docs.map((doc) => ({
      id: doc.id,
      name: doc.data().name,
      imei: doc.data().imei,
      stationCode: doc.data().stationCode,
    }));

    return NextResponse.json({
      projectId,
      systemUsersCount: users.length,
      systemUsers: users,
      stationsCount: stations.length,
      stations,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Firebase check failed" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/firebase-admin';
import { authenticateRequest, requireRole, TokenPayload } from '@/lib/auth';
import { cacheComponent, buildPrivateCacheControl } from '@/lib/cacheComponent';

const CACHE_TTL_MS = 30_000;

export async function GET(req: NextRequest) {
  const auth = authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;
  const roleCheck = requireRole(auth as TokenPayload, ['user', 'moderator', 'admin']);
  if (roleCheck) return roleCheck;

  try {
    const payload = await cacheComponent.remember(
      'stations:stats:all',
      CACHE_TTL_MS,
      async () => {
        const snap = await db.collection('station_stats').get();
        const stations: any[] = [];
        snap.forEach((doc) => {
          stations.push(doc.data());
        });
        return { stations };
      },
    );

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': buildPrivateCacheControl(CACHE_TTL_MS),
      },
    });
  } catch (err: any) {
    console.error('Get All Station Stats Error:', err.message);
    return NextResponse.json({ error: 'Failed to fetch all station stats' }, { status: 500 });
  }
}

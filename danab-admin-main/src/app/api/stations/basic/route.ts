import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/firebase-admin';
import { authenticateRequest, requireRole, TokenPayload } from '@/lib/auth';
import { cacheComponent, buildPrivateCacheControl } from '@/lib/cacheComponent';

const CACHE_TTL_MS = 60_000;

export async function GET(req: NextRequest) {
  const auth = authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;
  const roleCheck = requireRole(auth as TokenPayload, ['user', 'moderator', 'admin']);
  if (roleCheck) return roleCheck;

  try {
    const result = await cacheComponent.remember(
      'stations:basic',
      CACHE_TTL_MS,
      async () => {
        const stationsSnap = await db.collection('stations').get();

        if (stationsSnap.empty) {
          return {
            status: 404,
            body: { error: 'No stations found ❌' },
          };
        }

        const stations = stationsSnap.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            imei: data.imei || '',
            name: data.name || 'Unnamed Station',
            iccid: data.iccid || 'Unknown',
            location: data.location || 'Not Set',
            totalSlots: data.totalSlots || 0,
          };
        });

        return {
          status: 200,
          body: { stations },
        };
      },
    );

    return NextResponse.json(result.body, {
      status: result.status,
      headers: {
        'Cache-Control': buildPrivateCacheControl(CACHE_TTL_MS),
      },
    });
  } catch (error: any) {
    console.error('❌ Error fetching basic station info:', error.message);
    return NextResponse.json({ error: 'Failed to fetch station basics ❌' }, { status: 500 });
  }
}

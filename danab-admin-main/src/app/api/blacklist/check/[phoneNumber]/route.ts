import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/firebase-admin';
import { authenticateRequest } from '@/lib/auth';
import { cacheComponent, buildPrivateCacheControl } from '@/lib/cacheComponent';

const CACHE_TTL_MS = 20_000;

function normalizePhone(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  return digits.slice(-9);
}

export async function GET(req: NextRequest, { params }: { params: { phoneNumber: string } }) {
  const auth = authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;

  const { phoneNumber } = params;
  const normalized = normalizePhone(phoneNumber);

  if (normalized.length < 8) {
    return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
  }

  try {
    const payload = await cacheComponent.remember(
      `blacklist:check:${normalized}`,
      CACHE_TTL_MS,
      async () => {
        const snapshot = await db
          .collection('blacklist')
          .where('normalizedPhone', '==', normalized)
          .limit(1)
          .get();

        return {
          phoneNumber,
          isBlacklisted: !snapshot.empty,
        };
      },
    );

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': buildPrivateCacheControl(CACHE_TTL_MS),
      },
    });
  } catch (err: any) {
    console.error('❌ Error checking blacklist:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

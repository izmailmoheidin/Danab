import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/firebase-admin';
import { authenticateRequest, requireRole, TokenPayload } from '@/lib/auth';
import { writeAuditLog } from '@/lib/auditLog';
import { cacheComponent } from '@/lib/cacheComponent';
import {
  assertSafeFreeText,
  assertSafeIdentifier,
  assertSafeOptionalFreeText,
  normalizeFreeText,
  normalizeIdentifier,
} from '@/lib/inputValidation';

export async function POST(req: NextRequest) {
  const auth = authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth as TokenPayload;
  const roleCheck = requireRole(user, ['admin']);
  if (roleCheck) return roleCheck;

  try {
    const { imei, name, iccid, location = '', totalSlots = 6 } = await req.json();
    const normalizedImei = normalizeIdentifier(imei);
    const normalizedName = normalizeFreeText(name);
    const normalizedIccid = normalizeIdentifier(iccid);
    const normalizedLocation = normalizeFreeText(location);

    if (!normalizedImei || !normalizedName || !normalizedIccid) {
      return NextResponse.json({ error: 'imei, name, and iccid are required ❌' }, { status: 400 });
    }

    const imeiError = assertSafeIdentifier('IMEI', normalizedImei, 64);
    if (imeiError) return NextResponse.json({ error: imeiError }, { status: 400 });
    const nameError = assertSafeFreeText('Station name', normalizedName, 100);
    if (nameError) return NextResponse.json({ error: nameError }, { status: 400 });
    const iccidError = assertSafeIdentifier('ICCID', normalizedIccid, 64);
    if (iccidError) return NextResponse.json({ error: iccidError }, { status: 400 });
    const locationError = assertSafeOptionalFreeText('Location', normalizedLocation, 120);
    if (locationError) return NextResponse.json({ error: locationError }, { status: 400 });
    if (!Number.isInteger(totalSlots) || totalSlots < 1 || totalSlots > 64) {
      return NextResponse.json({ error: 'totalSlots must be an integer between 1 and 64' }, { status: 400 });
    }

    const imeiSnap = await db.collection('stations').where('imei', '==', normalizedImei).get();
    if (!imeiSnap.empty) {
      return NextResponse.json({ error: 'Station with this IMEI already exists ❌' }, { status: 409 });
    }

    const nameSnap = await db.collection('stations').where('name', '==', normalizedName).get();
    if (!nameSnap.empty) {
      return NextResponse.json({ error: 'Station with this Name already exists ❌' }, { status: 409 });
    }

    const iccidSnap = await db.collection('stations').where('iccid', '==', normalizedIccid).get();
    if (!iccidSnap.empty) {
      return NextResponse.json({ error: 'Station with this ICCID already exists ❌' }, { status: 409 });
    }

    const now = new Date();
    const after = {
      imei: normalizedImei,
      name: normalizedName,
      iccid: normalizedIccid,
      location: normalizedLocation,
      totalSlots,
      createdAt: now,
      updatedAt: now,
    };

    await db.collection('stations').doc(normalizedImei).set(after);
    await writeAuditLog({
      req,
      actor: user,
      action: 'station.create',
      targetType: 'station',
      targetId: normalizedImei,
      targetLabel: normalizedName,
      after,
    });

    cacheComponent.invalidatePrefix('stations:');
    cacheComponent.invalidate('transactions:latest');

    return NextResponse.json({ message: 'Station added ✅' }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to add station ❌' }, { status: 500 });
  }
}

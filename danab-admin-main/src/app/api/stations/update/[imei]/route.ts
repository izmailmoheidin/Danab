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

export async function PUT(req: NextRequest, { params }: { params: { imei: string } }) {
  const auth = authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth as TokenPayload;
  const roleCheck = requireRole(user, ['admin']);
  if (roleCheck) return roleCheck;

  try {
    const { imei } = params;
    const updates = await req.json();

    const stationRef = db.collection('stations').doc(imei);
    const doc = await stationRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Station not found ❌' }, { status: 404 });
    }

    const before = doc.data() || {};
    const sanitizedUpdates: Record<string, unknown> = {};

    if (typeof updates.name === 'string') {
      const normalizedName = normalizeFreeText(updates.name);
      const nameError = assertSafeFreeText('Station name', normalizedName, 100);
      if (nameError) return NextResponse.json({ error: nameError }, { status: 400 });
      const nameSnap = await db.collection('stations').where('name', '==', normalizedName).get();
      if (!nameSnap.empty && nameSnap.docs.some((entry) => entry.id !== imei)) {
        return NextResponse.json({ error: 'Station with this Name already exists ❌' }, { status: 409 });
      }
      sanitizedUpdates.name = normalizedName;
    }

    if (typeof updates.iccid === 'string') {
      const normalizedIccid = normalizeIdentifier(updates.iccid);
      const iccidError = assertSafeIdentifier('ICCID', normalizedIccid, 64);
      if (iccidError) return NextResponse.json({ error: iccidError }, { status: 400 });
      const iccidSnap = await db.collection('stations').where('iccid', '==', normalizedIccid).get();
      if (!iccidSnap.empty && iccidSnap.docs.some((entry) => entry.id !== imei)) {
        return NextResponse.json({ error: 'Station with this ICCID already exists ❌' }, { status: 409 });
      }
      sanitizedUpdates.iccid = normalizedIccid;
    }

    if (typeof updates.location === 'string') {
      const normalizedLocation = normalizeFreeText(updates.location);
      const locationError = assertSafeOptionalFreeText('Location', normalizedLocation, 120);
      if (locationError) return NextResponse.json({ error: locationError }, { status: 400 });
      sanitizedUpdates.location = normalizedLocation;
    }

    if (typeof updates.imei === 'string') {
      const normalizedImei = normalizeIdentifier(updates.imei);
      const imeiError = assertSafeIdentifier('IMEI', normalizedImei, 64);
      if (imeiError) return NextResponse.json({ error: imeiError }, { status: 400 });
      if (normalizedImei !== imei) {
        return NextResponse.json({ error: 'IMEI cannot be changed on an existing station ❌' }, { status: 400 });
      }
    }

    if (typeof updates.totalSlots === 'number') {
      if (!Number.isInteger(updates.totalSlots) || updates.totalSlots < 1 || updates.totalSlots > 64) {
        return NextResponse.json({ error: 'totalSlots must be an integer between 1 and 64' }, { status: 400 });
      }
      sanitizedUpdates.totalSlots = updates.totalSlots;
    }

    const after: Record<string, unknown> = {
      ...before,
      ...sanitizedUpdates,
      updatedAt: new Date(),
    };
    await stationRef.update(after);
    await writeAuditLog({
      req,
      actor: user,
      action: 'station.update',
      targetType: 'station',
      targetId: imei,
      targetLabel: String(after.name || before.name || imei),
      before,
      after,
    });
    cacheComponent.invalidatePrefix('stations:');
    cacheComponent.invalidate('transactions:latest');
    return NextResponse.json({ message: 'Station updated successfully ✅' });
  } catch {
    return NextResponse.json({ error: 'Failed to update station ❌' }, { status: 500 });
  }
}

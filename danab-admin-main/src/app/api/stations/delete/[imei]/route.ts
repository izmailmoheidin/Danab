import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/firebase-admin';
import { authenticateRequest, requireRole, TokenPayload } from '@/lib/auth';
import { writeAuditLog } from '@/lib/auditLog';
import { cacheComponent } from '@/lib/cacheComponent';

export async function DELETE(req: NextRequest, { params }: { params: { imei: string } }) {
  const auth = authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth as TokenPayload;
  const roleCheck = requireRole(user, ['admin']);
  if (roleCheck) return roleCheck;

  try {
    const { imei } = params;
    const stationRef = db.collection('stations').doc(imei);
    const doc = await stationRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Station not found ❌' }, { status: 404 });
    }

    const before = doc.data() || {};
    await stationRef.delete();
    await writeAuditLog({
      req,
      actor: user,
      action: 'station.delete',
      targetType: 'station',
      targetId: imei,
      targetLabel: String(before.name || imei),
      before,
    });
    cacheComponent.invalidatePrefix('stations:');
    cacheComponent.invalidate('transactions:latest');
    return NextResponse.json({ message: 'Station deleted successfully 🗑️✅' });
  } catch {
    return NextResponse.json({ error: 'Failed to delete station ❌' }, { status: 500 });
  }
}

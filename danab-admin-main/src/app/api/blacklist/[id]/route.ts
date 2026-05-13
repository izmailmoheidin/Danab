import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/firebase-admin';
import { authenticateRequest, requireRole, TokenPayload } from '@/lib/auth';
import { cacheComponent } from '@/lib/cacheComponent';

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth as TokenPayload;
  const roleCheck = requireRole(user, ['user', 'moderator', 'admin']);
  if (roleCheck) return roleCheck;

  try {
    const { id } = params;
    const doc = await db.collection('blacklist').doc(id).get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Blacklist entry not found' }, { status: 404 });
    }

    console.log(`🗑️ Blacklist entry deleted by: ${user.username} (${user.role})`);

    await db.collection('blacklist').doc(id).delete();
    cacheComponent.invalidatePrefix('blacklist:');

    return NextResponse.json({
      success: true,
      message: 'User removed from blacklist',
      deletedBy: user.username,
    });
  } catch (err: any) {
    console.error('❌ Error removing from blacklist:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

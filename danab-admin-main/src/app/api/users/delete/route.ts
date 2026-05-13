import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/firebase-admin';
import { authenticateRequest, requireRole, TokenPayload } from '@/lib/auth';
import { writeAuditLog } from '@/lib/auditLog';
import { cacheComponent } from '@/lib/cacheComponent';

export async function DELETE(req: NextRequest) {
  const auth = authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth as TokenPayload;
  const roleCheck = requireRole(user, ['admin']);
  if (roleCheck) return roleCheck;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const username = searchParams.get('username');

    if (!id && !username) {
      return NextResponse.json(
        { error: "Provide 'id' or 'username' to delete user ❌" },
        { status: 400 }
      );
    }

    if (id) {
      const docRef = db.collection('system_users').doc(id);
      const doc = await docRef.get();
      if (!doc.exists) {
        return NextResponse.json({ error: 'User not found ❌' }, { status: 404 });
      }
      const before = doc.data() || {};
      await docRef.delete();
      await writeAuditLog({
        req,
        actor: user,
        action: 'user.delete',
        targetType: 'user',
        targetId: docRef.id,
        targetLabel: String(before.username || ''),
        before,
      });
    } else {
      const snap = await db.collection('system_users').where('username', '==', username).limit(1).get();
      if (snap.empty) {
        return NextResponse.json({ error: 'User not found ❌' }, { status: 404 });
      }
      const before = snap.docs[0].data();
      await snap.docs[0].ref.delete();
      await writeAuditLog({
        req,
        actor: user,
        action: 'user.delete',
        targetType: 'user',
        targetId: snap.docs[0].id,
        targetLabel: String(before.username || username || ''),
        before,
      });
    }

    cacheComponent.invalidatePrefix('users:');
    return NextResponse.json({ message: 'User deleted successfully ✅' });
  } catch {
    return NextResponse.json({ error: 'Failed to delete user ❌' }, { status: 500 });
  }
}

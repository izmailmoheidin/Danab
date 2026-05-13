import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/firebase-admin';
import { authenticateRequest, requireRole, TokenPayload } from '@/lib/auth';
import { writeAuditLog } from '@/lib/auditLog';
import { cacheComponent } from '@/lib/cacheComponent';
import {
  assertValidEmail,
  assertValidPassword,
  assertValidUsername,
  normalizeEmail,
  normalizeUsername,
  normalizeUsernameLookup,
} from '@/lib/inputValidation';
import { hashPassword } from '@/lib/passwords';

export async function POST(req: NextRequest) {
  const auth = authenticateRequest(req);
  if (auth instanceof NextResponse) return auth;
  const user = auth as TokenPayload;
  const roleCheck = requireRole(user, ['admin']);
  if (roleCheck) return roleCheck;

  try {
    const { username, password, role, email, permissions = [] } = await req.json();
    const normalizedUsername = normalizeUsername(username);
    const normalizedUsernameLookup = normalizeUsernameLookup(username);
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedUsername || !password || !role || !normalizedEmail) {
      return NextResponse.json(
        { error: 'username, password, role, and email are required ❌' },
        { status: 400 }
      );
    }

    const usernameError = assertValidUsername(normalizedUsername);
    if (usernameError) {
      return NextResponse.json({ error: usernameError }, { status: 400 });
    }
    const emailError = assertValidEmail(normalizedEmail);
    if (emailError) {
      return NextResponse.json({ error: emailError }, { status: 400 });
    }
    const passwordError = assertValidPassword(password);
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    if (!['admin', 'moderator', 'user'].includes(role)) {
      return NextResponse.json(
        { error: "Role must be 'admin', 'moderator', or 'user' ❌" },
        { status: 400 }
      );
    }

    const usernameNormalizedSnap = await db
      .collection('system_users')
      .where('usernameNormalized', '==', normalizedUsernameLookup)
      .get();
    if (!usernameNormalizedSnap.empty) {
      return NextResponse.json({ error: 'Username already exists ❌' }, { status: 409 });
    }

    const usernameSnap = await db.collection('system_users').where('username', '==', normalizedUsername).get();
    if (!usernameSnap.empty) {
      return NextResponse.json({ error: 'Username already exists ❌' }, { status: 409 });
    }

    const emailSnap = await db.collection('system_users').where('email', '==', normalizedEmail).get();
    if (!emailSnap.empty) {
      return NextResponse.json({ error: 'Email already exists ❌' }, { status: 409 });
    }

    const now = new Date();
    const after = {
      username: normalizedUsername,
      usernameNormalized: normalizedUsernameLookup,
      role,
      email: normalizedEmail,
      permissions: Array.isArray(permissions) ? permissions : [],
      createdAt: now,
      updatedAt: now,
    };
    const newUserRef = await db.collection('system_users').add({
      ...after,
      password: await hashPassword(password),
    });

    await writeAuditLog({
      req,
      actor: user,
      action: 'user.create',
      targetType: 'user',
      targetId: newUserRef.id,
      targetLabel: normalizedUsername,
      after,
    });

    cacheComponent.invalidatePrefix('users:');

    return NextResponse.json({ message: 'User added ✅', id: newUserRef.id }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to add user ❌' }, { status: 500 });
  }
}

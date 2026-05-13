import jwt from 'jsonwebtoken';
import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME } from "@/lib/authCookie";

const TOKEN_EXPIRY = '1h';

export interface TokenPayload {
  id: string;
  username: string;
  role: string;
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim().length < 32) {
    throw new Error("JWT_SECRET must be set and at least 32 characters long");
  }
  return secret;
}

export function assertJwtConfigured(): void {
  getJwtSecret();
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: TOKEN_EXPIRY });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, getJwtSecret()) as TokenPayload;
}

export function getTokenFromRequest(req: NextRequest): string | null {
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1];
  }
  return req.cookies.get(AUTH_COOKIE_NAME)?.value || null;
}

export function authenticateRequest(req: NextRequest): TokenPayload | NextResponse {
  const token = getTokenFromRequest(req);
  if (!token) {
    return NextResponse.json({ error: 'Access denied. No token provided.' }, { status: 401 });
  }
  try {
    return verifyToken(token);
  } catch {
    return NextResponse.json({ error: 'Invalid or expired token.' }, { status: 403 });
  }
}

export function requireRole(user: TokenPayload, roles: string[]): NextResponse | null {
  if (!roles.includes(user.role)) {
    return NextResponse.json({ error: `${roles[0]} access required.` }, { status: 403 });
  }
  return null;
}

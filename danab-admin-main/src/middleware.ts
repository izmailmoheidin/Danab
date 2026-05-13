import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { AUTH_COOKIE_NAME } from "@/lib/authCookie";

const publicPaths = ['/login', '/'];

const USER_ROUTES = [
  "/slots",
  "/active-rentals",
  "/settings",
  "/notifications",
  "/powerbanks",
  "/rentals",
  "/blacklist",
];

const MODERATOR_ROUTES = [
  "/dashboard",
  "/stations",
  "/station-comparison",
  "/revenue",
  "/problem-slots",
  "/station/",
];

const ADMIN_ROUTES = ["/users"];

type SessionPayload = {
  role?: string;
  exp?: number;
};

function base64UrlToUint8Array(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function decodeJwtPayload(token: string): SessionPayload | null {
  const segments = token.split(".");
  if (segments.length !== 3) return null;

  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToUint8Array(segments[1])));
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

async function verifyJwt(token: string): Promise<SessionPayload | null> {
  const segments = token.split(".");
  if (segments.length !== 3) return null;

  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim().length < 32) return null;

  const [header, payload, signature] = segments;

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const expectedSignature = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${header}.${payload}`),
    );
    const signatureBytes = new Uint8Array(expectedSignature);
    let binary = "";
    signatureBytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    const expected = btoa(binary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
    if (expected !== signature) return null;

    const decoded = decodeJwtPayload(token);
    if (!decoded) return null;
    if (typeof decoded.exp === "number" && decoded.exp * 1000 < Date.now()) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

function canAccessPath(pathname: string, role: string): boolean {
  if (ADMIN_ROUTES.some((route) => pathname.startsWith(route))) {
    return role === "admin";
  }
  if (MODERATOR_ROUTES.some((route) => pathname.startsWith(route))) {
    return role === "admin" || role === "moderator";
  }
  if (USER_ROUTES.some((route) => pathname.startsWith(route))) {
    return role === "admin" || role === "moderator" || role === "user";
  }
  return true;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    publicPaths.some((p) => pathname === p)
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const session = await verifyJwt(token);
  if (!session?.role) {
    const response = NextResponse.redirect(new URL('/login', request.url));
    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: "",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: new Date(0),
    });
    return response;
  }

  if (!canAccessPath(pathname, String(session.role).toLowerCase())) {
    return NextResponse.redirect(new URL('/slots', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

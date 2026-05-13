import { NextResponse } from "next/server";

import { AUTH_COOKIE_NAME } from "@/lib/authCookie";

export async function POST() {
  const response = NextResponse.json({ message: "Logged out ✅" });
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

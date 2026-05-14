import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const imei = searchParams.get("imei") || "WSEP161721195358";

  const apiKey = process.env.HEYCHARGE_API_KEY;
  const domain = process.env.HEYCHARGE_DOMAIN;

  if (!apiKey || !domain) {
    return NextResponse.json(
      { error: "Missing HEYCHARGE_API_KEY or HEYCHARGE_DOMAIN" },
      { status: 500 }
    );
  }

  const auth = `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;

  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 12000);

    const res = await fetch(`${domain}/v1/station/${imei}`, {
      headers: { Authorization: auth },
      cache: "no-store",
      signal: controller.signal,
    });

    clearTimeout(t);

    const body = await res.json().catch(() => null);

    return NextResponse.json({
      imei,
      status: res.status,
      statusText: res.statusText,
      ok: res.ok,
      body,
      headers: {
        "content-type": res.headers.get("content-type"),
      },
    });
  } catch (err: any) {
    return NextResponse.json({
      imei,
      error: err.message || String(err),
      name: err.name,
    });
  }
}

import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json(
    { ok: true, ts: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

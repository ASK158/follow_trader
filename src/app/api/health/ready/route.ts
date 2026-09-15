import { access, constants } from "node:fs/promises";
import { NextResponse } from "next/server";
import { getMarketplaceDb } from "@/lib/marketplace/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const database = getMarketplaceDb();
    database.prepare("SELECT 1").get();
    await access(process.env.SIGNAL_DATA_DIR ?? ".signal-data", constants.R_OK | constants.W_OK);

    return NextResponse.json(
      { status: "ready", checkedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Readiness check failed", error);
    return NextResponse.json(
      { status: "unavailable", checkedAt: new Date().toISOString() },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
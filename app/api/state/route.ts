import { NextResponse } from "next/server";
import { vaultState } from "@/lib/solana";
export const dynamic = "force-dynamic";

export async function GET() {
  try { return NextResponse.json(await vaultState()); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

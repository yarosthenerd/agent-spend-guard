import { NextResponse } from "next/server";
import { createRevokeInstruction, getAssociatedTokenAddress } from "@solana/spl-token";
import { explorer, memoIx, mint, owner, send, vaultState } from "@/lib/solana";
export const dynamic = "force-dynamic";

/** Kill switch. One instruction, and the agent's authority is gone on-chain. */
export async function POST() {
  try {
    const o = owner();
    const ata = await getAssociatedTokenAddress(mint(), o.publicKey);
    const sig = await send([
      memoIx("spend-guard:revoke", o.publicKey),
      createRevokeInstruction(ata, o.publicKey),
    ], [o]);
    return NextResponse.json({ ok: true, sig, explorer: explorer(sig), state: await vaultState() });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

import { NextResponse } from "next/server";
import { createApproveCheckedInstruction, getAssociatedTokenAddress } from "@solana/spl-token";
import { DECIMALS, agent, explorer, memoIx, mint, owner, send, toBase, vaultState } from "@/lib/solana";
export const dynamic = "force-dynamic";

/** Owner grants the agent a capped, on-chain-enforced allowance over the vault. */
export async function POST(req: Request) {
  try {
    const { amount } = await req.json();
    if (!(amount > 0)) return NextResponse.json({ error: "amount must be > 0" }, { status: 400 });

    const o = owner(), a = agent(), m = mint();
    const ata = await getAssociatedTokenAddress(m, o.publicKey);

    const sig = await send([
      memoIx(`spend-guard:approve:${amount}`, o.publicKey),
      createApproveCheckedInstruction(ata, m, a.publicKey, o.publicKey, toBase(amount), DECIMALS),
    ], [o]);

    return NextResponse.json({ ok: true, sig, explorer: explorer(sig), state: await vaultState() });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

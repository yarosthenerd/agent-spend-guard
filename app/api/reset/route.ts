import { NextResponse } from "next/server";
import { createMintToInstruction, getAccount, getAssociatedTokenAddress } from "@solana/spl-token";
import { DECIMALS, connection, ensureAllowance, explorer, memoIx, mint, owner, send, toBase, vaultState } from "@/lib/solana";
export const dynamic = "force-dynamic";

const TARGET_BALANCE = 10_000;

/**
 * Async judging means many people click the same devnet vault. This puts it back to a
 * known starting state: allowance re-granted, vault topped back up. Demo-only.
 */
export async function POST() {
  try {
    const o = owner(), m = mint();
    const ata = await getAssociatedTokenAddress(m, o.publicKey);
    const sigs: string[] = [];

    const bal = Number((await getAccount(connection(), ata)).amount) / 10 ** DECIMALS;
    if (bal < TARGET_BALANCE) {
      sigs.push(await send([
        memoIx("mandate:reset", o.publicKey),
        createMintToInstruction(m, ata, o.publicKey, toBase(TARGET_BALANCE - bal)),
      ], [o]));
    }

    // Force a fresh approval regardless of what is left.
    const s = await ensureAllowance(Number.MAX_SAFE_INTEGER, 5000);
    if (s) sigs.push(s);

    return NextResponse.json({
      ok: true, sigs, explorer: sigs.length ? explorer(sigs[sigs.length - 1]) : null,
      state: await vaultState(),
    });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

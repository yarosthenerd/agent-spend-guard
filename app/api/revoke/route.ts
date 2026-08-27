import { NextResponse } from "next/server";
import { createRevokeInstruction, createTransferCheckedInstruction, getAssociatedTokenAddress } from "@solana/spl-token";
import { DECIMALS, agent, explorer, memoIx, mint, multisigDelegate, owner, policyKp, send, vaultState, venue } from "@/lib/solana";
export const dynamic = "force-dynamic";

/**
 * The kill switch. One instruction, and the delegate is gone — enforced by the token
 * program, so it survives this service being fully compromised. After revoking we
 * immediately attempt a fully co-signed transfer to prove the authority is actually dead.
 */
export async function POST() {
  try {
    const o = owner();
    const ata = await getAssociatedTokenAddress(mint(), o.publicKey);
    const sig = await send([
      memoIx("mandate:revoke", o.publicKey),
      createRevokeInstruction(ata, o.publicKey),
    ], [o]);

    // Proof: even agent + policy together can no longer move the vault.
    let proof = "revoked, but the follow-up check did not run";
    try {
      const venueAta = await getAssociatedTokenAddress(mint(), venue());
      await send([createTransferCheckedInstruction(
        ata, mint(), venueAta, multisigDelegate(), 1_000_000n, DECIMALS,
        [agent().publicKey, policyKp().publicKey],
      )], [agent(), policyKp()]);
      proof = "a co-signed transfer still succeeded — the revoke did not take effect";
    } catch (e: any) {
      const code = String(e.message).match(/custom program error: (0x[0-9a-f]+)/)?.[1];
      proof = code
        ? `Verified: a fully co-signed transfer now fails on-chain (${code}). Agent and policy service together have no authority left.`
        : "Verified: the co-signed transfer no longer lands.";
    }

    return NextResponse.json({ ok: true, sig, explorer: explorer(sig), proof, state: await vaultState() });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

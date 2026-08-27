import { NextResponse } from "next/server";
import { createTransferCheckedInstruction, getAssociatedTokenAddress } from "@solana/spl-token";
import { createHash } from "crypto";
import { PublicKey } from "@solana/web3.js";
import { DECIMALS, agent, explorer, memoIx, mint, owner, send, toBase, vaultState } from "@/lib/solana";
export const dynamic = "force-dynamic";

type Policy = { perTxCap: number; dailyCap: number; allowlist: string[] };

/**
 * The agent spends from the owner's vault as an SPL Token delegate.
 * Two independent layers stand between the agent and the money:
 *   1. policy  - per-tx cap, rolling daily cap, destination allowlist (this service)
 *   2. chain   - the delegated allowance ceiling, enforced by the SPL Token program itself
 * Layer 1 is convenience. Layer 2 holds even if layer 1 is compromised.
 */
export async function POST(req: Request) {
  try {
    const { amount, destination, policy, spentToday = 0 } = (await req.json()) as {
      amount: number; destination: string; policy: Policy; spentToday?: number;
    };

    if (!(amount > 0)) return NextResponse.json({ error: "amount must be > 0" }, { status: 400 });

    // --- Layer 1: policy ---
    if (amount > policy.perTxCap)
      return deny("policy", `per-transaction cap is ${policy.perTxCap} gUSD; agent asked for ${amount}`);
    if (spentToday + amount > policy.dailyCap)
      return deny("policy", `daily cap ${policy.dailyCap} gUSD would be exceeded (${spentToday} already spent today)`);
    if (!policy.allowlist.includes(destination))
      return deny("policy", `destination ${destination.slice(0, 8)}… is not on the allowlist`);

    // --- Layer 2: chain ---
    const a = agent(), m = mint();
    const vault = await getAssociatedTokenAddress(m, owner().publicKey);
    const dest = await getAssociatedTokenAddress(m, new PublicKey(destination));

    // Commit the policy in force to the chain, so a spend can never be retroactively disowned.
    const policyHash = createHash("sha256").update(JSON.stringify(policy)).digest("hex").slice(0, 16);

    try {
      const sig = await send([
        memoIx(`spend-guard:trade:${amount}:policy=${policyHash}`, a.publicKey),
        createTransferCheckedInstruction(vault, m, dest, a.publicKey, toBase(amount), DECIMALS),
      ], [a]);
      return NextResponse.json({
        ok: true, layer: "chain", sig, explorer: explorer(sig), policyHash, state: await vaultState(),
      });
    } catch (e: any) {
      const msg: string = e?.message ?? String(e);
      const insufficient = /custom program error: 0x1\b|insufficient funds/i.test(msg);
      const revoked = /custom program error: 0x4\b|owner does not match/i.test(msg);
      return deny(
        "chain",
        insufficient
          ? "SPL Token rejected the transfer: the delegated allowance is exhausted. The agent cannot exceed it, and this service was not consulted."
          : revoked
          ? "SPL Token rejected the transfer: the owner revoked the delegate. The agent has no authority over this vault."
          : msg.split("\n")[0],
        await vaultState(),
      );
    }
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

async function deny(layer: "policy" | "chain", reason: string, state?: any) {
  return NextResponse.json(
    { ok: false, layer, reason, state: state ?? (await vaultState()) },
    { status: 200 },
  );
}

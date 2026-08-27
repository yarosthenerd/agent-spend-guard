import { NextResponse } from "next/server";
import { compile, evaluate } from "@/lib/mandate";
import { buildSoloSwap, buildSwap, simulate } from "@/lib/preflight";
import { ensureAllowance, explorer, send, vaultState } from "@/lib/solana";
import { repairFor, scenarios } from "../preflight/route";
import { prices } from "@/lib/oracle";
export const dynamic = "force-dynamic";

/**
 * The policy service is one half of a 2-of-2 SPL Token multisig delegate. It co-signs only
 * when the simulated outcome satisfies the mandate. `solo` demonstrates the agent skipping
 * this service entirely, which the token program rejects on-chain.
 */
export async function POST(req: Request) {
  try {
    const { mandate: src, scenario, solo = false, repair = false } = await req.json();
    const sc = (await scenarios())[scenario];
    if (!sc) return NextResponse.json({ error: "unknown scenario" }, { status: 400 });

    await ensureAllowance();

    if (solo) {
      const { ixs, coSigners } = await buildSoloSwap(sc.swap);
      try {
        const sig = await send(ixs, coSigners);
        return NextResponse.json({ ok: true, solo: true, sig, explorer: explorer(sig), state: await vaultState() });
      } catch (e: any) {
        const msg = String(e.message);
        const code = msg.match(/custom program error: (0x[0-9a-f]+)/)?.[1];
        return NextResponse.json({
          ok: false, solo: true, onChain: true, code: code ?? null,
          reason: code === "0x4"
            ? `SPL Token rejected it on-chain (${code}, owner mismatch). The delegate is the 2-of-2 multisig, so the agent key alone has no authority over this vault. Skipping the policy service is not an option the agent has.`
            : msg.split("\n")[0],
          state: await vaultState(),
        });
      }
    }

    const m = compile(src);
    let swap = sc.swap;
    const findings0 = evaluate(m, await simulate(swap));

    // Repair: co-sign the corrected trade rather than the one the agent proposed.
    let repaired: any = null;
    if (repair) {
      const px = await prices(["gUSD", "SOLX", "SCAM"]);
      repaired = repairFor(m, findings0, swap, px);
      if (!repaired) return NextResponse.json({ ok: false, reason: "nothing to repair here", state: await vaultState() });
      swap = { ...swap, receiveAmount: repaired.minimum };
    }

    const findings = repair ? evaluate(m, await simulate(swap)) : findings0;
    const blocked = findings.filter((f) => !f.ok);
    if (blocked.length)
      return NextResponse.json({
        ok: false, blocked: true, findings,
        reason: `The policy service refused to co-sign: ${blocked.map((b) => b.constraint).join("; ")}. Without its signature the transaction cannot be assembled.`,
        state: await vaultState(),
      });

    const { ixs, coSigners } = await buildSwap(swap);
    const sig = await send(ixs, coSigners);
    return NextResponse.json({ ok: true, sig, explorer: explorer(sig), findings, repaired, state: await vaultState() });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

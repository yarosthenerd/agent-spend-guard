import { NextResponse } from "next/server";
import { compile, evaluate } from "@/lib/mandate";
import { buildSwap, simulate } from "@/lib/preflight";
import { explorer, send, vaultState } from "@/lib/solana";
import { SCENARIOS } from "../preflight/route";
export const dynamic = "force-dynamic";

/** Signing happens only after the simulated outcome satisfies the mandate. */
export async function POST(req: Request) {
  try {
    const { mandate: src, scenario, override = false } = await req.json();
    const sc = SCENARIOS[scenario];
    if (!sc) return NextResponse.json({ error: "unknown scenario" }, { status: 400 });

    const findings = evaluate(compile(src), await simulate(sc.swap));
    const blocked = findings.filter((f) => !f.ok);

    if (blocked.length && !override)
      return NextResponse.json({
        ok: false, blocked: true, findings,
        reason: `mandate refused before signing: ${blocked.map((b) => b.constraint).join("; ")}`,
        state: await vaultState(),
      });

    const { tx, signers } = await buildSwap(sc.swap);
    const sig = await send(tx.instructions, signers);
    return NextResponse.json({
      ok: true, sig, explorer: explorer(sig), findings,
      overridden: blocked.length > 0,
      state: await vaultState(),
    });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

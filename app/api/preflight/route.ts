import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { compile, evaluate } from "@/lib/mandate";
import { simulate, type Swap } from "@/lib/preflight";
import { prices } from "@/lib/oracle";
import { ensureAllowance, vaultState } from "@/lib/solana";
export const dynamic = "force-dynamic";

/** Trade sizes are derived from the live oracle so the demo prices itself off real data. */
export async function scenarios(): Promise<Record<string, { label: string; note: string; swap: Swap }>> {
  const px = await prices(["SOLX"]);
  const p = px.SOLX.priceable ? px.SOLX.price : 100;
  return {
    good: {
      label: "Buy SOLX at the reference price",
      note: "A sane fill, within a fraction of a percent of the oracle.",
      swap: { spend: 100, receiveSymbol: "SOLX", receiveAmount: +((100 / p) * 0.996).toFixed(6) },
    },
    badexec: {
      label: "Buy SOLX 40% below the reference price",
      note: "A priceable pair, a real Pyth feed, and a fill worth 300 gUSD for 500 gUSD paid.",
      swap: { spend: 500, receiveSymbol: "SOLX", receiveAmount: +((500 / p) * 0.6).toFixed(6) },
    },
    unpriceable: {
      label: "Swap the whole allowance into an unpriceable mint",
      note: "No approved oracle publishes a price, so the resulting position cannot be valued at all.",
      swap: { spend: 500, receiveSymbol: "SCAM", receiveAmount: 15000 },
    },
  };
}

/**
 * What each shipping control actually checks. Deliberately narrow: Squads hooks and Swig
 * roles CAN block an unknown mint, and saying otherwise would be wrong. The claim we make
 * is the one that survives a reader who knows their changelogs.
 */
const CONTROLS = [
  { name: "Foundation — Subscriptions & Allowances", checks: "cumulative cap, expiry, multi-delegate", pricesFill: false },
  { name: "Squads v5 — hooks", checks: "program whitelist, per-period caps, approval thresholds", pricesFill: false },
  { name: "Swig — policy roles", checks: "which programs and assets an agent may touch", pricesFill: false },
  { name: "Turnkey / Ledger Agent Stack", checks: "who holds the key, which device approves", pricesFill: false },
  { name: "Mandate", checks: "the simulated outcome, valued against an oracle", pricesFill: true },
];

export async function POST(req: Request) {
  try {
    const { mandate: src, scenario } = await req.json();
    const sc = (await scenarios())[scenario];
    if (!sc) return NextResponse.json({ error: "unknown scenario" }, { status: 400 });

    await ensureAllowance();
    const m = compile(src);
    const outcome = await simulate(sc.swap);
    const findings = evaluate(m, outcome);
    const px = await prices(["gUSD", "SOLX", "SCAM"]);

    return NextResponse.json({
      scenario, label: sc.label, note: sc.note, swap: sc.swap,
      mandateHash: createHash("sha256").update(src).digest("hex").slice(0, 16),
      mandateErrors: m.errors,
      outcome, findings, oracle: px, controls: CONTROLS,
      blocked: findings.some((f) => !f.ok),
      state: await vaultState(),
      ts: new Date().toISOString(),
    });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

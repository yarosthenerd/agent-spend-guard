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

/**
 * When the only thing wrong is the price, the mandate does not have to just refuse. It can
 * state the worst fill it will accept and co-sign that transaction instead — structurally
 * identical to binding `minOutAmount` before signing, and it maps to minOut on a real AMM.
 */
export function repairFor(m: ReturnType<typeof compile>, findings: any[], swap: Swap, px: any) {
  const violated = findings.filter((f) => !f.ok);
  if (violated.length !== 1 || !violated[0].constraint.startsWith("max slippage")) return null;
  const c = m.constraints.find((x) => x.kind === "slippage") as { kind: "slippage"; maxPct: number } | undefined;
  const p = px[swap.receiveSymbol];
  if (!c || !p?.priceable) return null;
  const min = +((swap.spend * (1 - c.maxPct / 100)) / p.price * 1.0001).toFixed(6);
  if (min <= swap.receiveAmount) return null;
  return {
    constraint: `max slippage ${c.maxPct}%`,
    symbol: swap.receiveSymbol,
    proposed: swap.receiveAmount,
    minimum: min,
    reference: p.price,
  };
}

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
      repair: repairFor(m, findings, sc.swap, px),
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

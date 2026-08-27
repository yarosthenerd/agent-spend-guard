import { NextResponse } from "next/server";
import { compile, evaluate } from "@/lib/mandate";
import { simulate, type Swap } from "@/lib/preflight";
import { vaultState } from "@/lib/solana";
export const dynamic = "force-dynamic";

export const SCENARIOS: Record<string, { label: string; swap: Swap; note: string }> = {
  good: {
    label: "Rebalance into SOLX",
    swap: { spend: 50, receiveSymbol: "SOLX", receiveAmount: 24.9 },
    note: "A sane trade, priced within a fraction of reference.",
  },
  drain: {
    label: "Swap the full allowance into a worthless mint",
    swap: { spend: 500, receiveSymbol: "SCAM", receiveAmount: 15000 },
    note: "Spends exactly the allowance. Exceeds no limit anywhere. Loses 40% of the vault.",
  },
};

/**
 * Verdicts of the amount-denominated controls this category already ships, modelled
 * from their public documentation. They all pass the drain, because they all ask
 * "how much?" and none of them ask "in exchange for what?".
 */
function incumbents(spend: number, allowance: number, programs: string[]) {
  const amountOk = spend <= allowance;
  return [
    { name: "Solana Foundation — Allowances (fixed delegation)", checks: "cumulative cap + expiry", ok: amountOk },
    { name: "Squads v5 — spending limits", checks: "per-period amount cap", ok: amountOk },
    { name: "Swig — policy roles", checks: "which programs an agent may call", ok: programs.every((p) => p === "spl-token" || p === "memo") },
    { name: "Spend-Guard v1 — SPL delegate ceiling", checks: "cumulative cap", ok: amountOk },
  ];
}

export async function POST(req: Request) {
  try {
    const { mandate: src, scenario } = await req.json();
    const sc = SCENARIOS[scenario];
    if (!sc) return NextResponse.json({ error: "unknown scenario" }, { status: 400 });

    const m = compile(src);
    const outcome = await simulate(sc.swap);
    const findings = evaluate(m, outcome);
    const state = await vaultState();

    return NextResponse.json({
      scenario, label: sc.label, note: sc.note, swap: sc.swap,
      mandateErrors: m.errors,
      outcome, findings,
      blocked: findings.some((f) => !f.ok),
      incumbents: incumbents(sc.swap.spend, state.allowanceRemaining, outcome.programIds),
      state,
    });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

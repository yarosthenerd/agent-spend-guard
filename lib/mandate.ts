/**
 * A mandate is what the owner allows the agent to *do*, compiled to constraints
 * that are checked against a simulated outcome rather than a declared amount.
 */
export type Constraint =
  | { kind: "programs"; allow: string[] }
  | { kind: "mints"; allow: string[] }
  | { kind: "slippage"; maxPct: number }
  | { kind: "maxTrade"; amount: number }
  | { kind: "concentration"; maxPct: number }
  | { kind: "drawdown"; maxPct: number }
  | { kind: "priceable" };

export type Mandate = { source: string; constraints: Constraint[]; errors: string[] };

export const DEFAULT_MANDATE = `allow programs: spl-token, memo
require oracle pricing
max slippage 2%
max trade 500 gUSD
max position 25% of vault
halt on drawdown 10%`;

/**
 * Deliberately a small constrained grammar, not a natural-language model.
 * The NL front-end is the next layer; faking it here would be a demo, not a check.
 */
export function compile(source: string): Mandate {
  const constraints: Constraint[] = [];
  const errors: string[] = [];

  for (const raw of source.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    let m: RegExpMatchArray | null;

    if ((m = line.match(/^allow\s+programs?\s*:\s*(.+)$/i)))
      constraints.push({ kind: "programs", allow: splitList(m[1]) });
    else if ((m = line.match(/^allow\s+mints?\s*:\s*(.+)$/i)))
      constraints.push({ kind: "mints", allow: splitList(m[1]) });
    else if (/^require\s+oracle\s+pricing$/i.test(line))
      constraints.push({ kind: "priceable" });
    else if ((m = line.match(/^max\s+slippage\s+([\d.]+)\s*%$/i)))
      constraints.push({ kind: "slippage", maxPct: parseFloat(m[1]) });
    else if ((m = line.match(/^max\s+trade\s+([\d.]+)\s*\w*$/i)))
      constraints.push({ kind: "maxTrade", amount: parseFloat(m[1]) });
    else if ((m = line.match(/^max\s+position\s+([\d.]+)\s*%\s*of\s*vault$/i)))
      constraints.push({ kind: "concentration", maxPct: parseFloat(m[1]) });
    else if ((m = line.match(/^halt\s+on\s+drawdown\s+([\d.]+)\s*%$/i)))
      constraints.push({ kind: "drawdown", maxPct: parseFloat(m[1]) });
    else errors.push(`could not compile: "${line}"`);
  }
  return { source, constraints, errors };
}

const splitList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

/** What the simulation says will actually happen, in value terms. */
export type Outcome = {
  programIds: string[];
  legs: { symbol: string; mint: string; delta: number; price: number; value: number; priceable: boolean; source: string }[];
  valueOut: number;
  valueIn: number;
  slippagePct: number;
  vaultValueBefore: number;
  vaultValueAfter: number;
  positions: { symbol: string; pct: number }[];
  drawdownPct: number;
};

export type Finding = { constraint: string; ok: boolean; detail: string };

export function evaluate(m: Mandate, o: Outcome): Finding[] {
  const f: Finding[] = [];
  for (const c of m.constraints) {
    switch (c.kind) {
      case "programs": {
        const bad = o.programIds.filter((p) => !c.allow.includes(p));
        f.push({
          constraint: `allow programs: ${c.allow.join(", ")}`,
          ok: bad.length === 0,
          detail: bad.length ? `transaction invokes ${bad.join(", ")}` : `only ${o.programIds.join(", ")} invoked`,
        });
        break;
      }
      case "mints": {
        const touched = o.legs.filter((l) => l.delta > 0).map((l) => l.symbol);
        const bad = touched.filter((s) => !c.allow.includes(s));
        f.push({
          constraint: `allow mints: ${c.allow.join(", ")}`,
          ok: bad.length === 0,
          detail: bad.length
            ? `vault would receive ${bad.join(", ")}, which the mandate does not allow`
            : `receives ${touched.join(", ") || "nothing"}`,
        });
        break;
      }
      case "priceable": {
        const held = o.legs.filter((l) => l.delta > 0);
        const bad = held.filter((l) => !l.priceable);
        f.push({
          constraint: "require oracle pricing",
          ok: bad.length === 0,
          detail: bad.length
            ? `vault would end up holding ${bad.map((b) => b.symbol).join(", ")}, which no approved oracle prices — the position cannot be valued, so it cannot be risk-checked`
            : held.length
            ? `${held.map((h) => `${h.symbol} priced by ${h.source}`).join("; ")}`
            : "no new positions",
        });
        break;
      }
      case "slippage": {
        const unpriced = o.legs.some((l) => l.delta > 0 && !l.priceable);
        const ok = !unpriced && o.slippagePct <= c.maxPct;
        f.push({
          constraint: `max slippage ${c.maxPct}%`,
          ok,
          detail: unpriced
            ? "cannot be evaluated: part of what the vault receives has no oracle price"
            : `paid ${fmt(o.valueOut)} for ${fmt(o.valueIn)} at oracle reference — ${o.slippagePct.toFixed(1)}% below reference`,
        });
        break;
      }
      case "maxTrade": {
        const ok = o.valueOut <= c.amount;
        f.push({
          constraint: `max trade ${c.amount} gUSD`,
          ok,
          detail: `trade size ${fmt(o.valueOut)}`,
        });
        break;
      }
      case "concentration": {
        const worst = o.positions.slice().sort((a, b) => b.pct - a.pct)[0];
        const ok = !worst || worst.pct <= c.maxPct;
        f.push({
          constraint: `max position ${c.maxPct}% of vault`,
          ok,
          detail: worst ? `largest position after trade: ${worst.symbol} at ${worst.pct.toFixed(1)}%` : "no positions",
        });
        break;
      }
      case "drawdown": {
        const ok = o.drawdownPct <= c.maxPct;
        f.push({
          constraint: `halt on drawdown ${c.maxPct}%`,
          ok,
          detail: `vault value ${fmt(o.vaultValueBefore)} → ${fmt(o.vaultValueAfter)} (${o.drawdownPct.toFixed(1)}% down)`,
        });
        break;
      }
    }
  }
  return f;
}

const fmt = (n: number) => `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })} gUSD`;

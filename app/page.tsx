"use client";

import { useCallback, useEffect, useState } from "react";

const DEFAULT_MANDATE = `allow programs: spl-token, memo
require oracle pricing
max slippage 2%
max trade 500 gUSD
max position 25% of vault
halt on drawdown 10%`;

type Finding = { constraint: string; ok: boolean; detail: string };
type Leg = { symbol: string; delta: number; value: number; price: number; priceable: boolean; source: string };
type Price = { symbol: string; priceable: boolean; price?: number; source?: string; feed?: string; slot?: string; reason?: string };
type Result = {
  scenario: string; label: string; note: string; blocked: boolean; mandateHash: string; ts: string;
  outcome: { legs: Leg[]; valueOut: number; valueIn: number; slippagePct: number; programIds: string[] };
  findings: Finding[];
  controls: { name: string; checks: string; pricesFill: boolean }[];
  oracle: Record<string, Price>;
  state: State;
};
type State = { vaultBalance: number; allowanceRemaining: number; vaultAta: string; multisigDelegate: string | null; policyPubkey: string; agentPubkey: string; delegateIsMultisig: boolean };
type Record_ = { ts: string; scenario: string; hash: string; verdict: string; detail: string; explorer?: string };

const ex = (a: string) => `https://explorer.solana.com/address/${a}?cluster=devnet`;
const n2 = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

const SCENARIOS = [
  { id: "good", label: "✓ Buy SOLX at the reference price", hint: "should settle" },
  { id: "badexec", label: "☠ Buy SOLX 40% below reference", hint: "priceable pair, bad fill" },
  { id: "unpriceable", label: "☠ Swap the allowance into an unpriceable mint", hint: "no oracle, no valuation" },
];

export default function Page() {
  const [mandate, setMandate] = useState(DEFAULT_MANDATE);
  const [s, setS] = useState<State | null>(null);
  const [res, setRes] = useState<Result | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [exec, setExec] = useState<{ ok: boolean; msg: string; explorer?: string } | null>(null);
  const [audit, setAudit] = useState<Record_[]>([]);

  const refresh = useCallback(async () => {
    const r = await fetch("/api/state", { cache: "no-store" });
    if (r.ok) setS(await r.json());
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const log = (r: Record_) => setAudit((a) => [r, ...a].slice(0, 40));

  async function preflight(id: string) {
    setBusy(id); setExec(null);
    const r: Result = await fetch("/api/preflight", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ mandate, scenario: id }),
    }).then((x) => x.json());
    setBusy(null);
    if ((r as any).error) return;
    setS(r.state); setRes(r);
    log({
      ts: r.ts, scenario: id, hash: r.mandateHash,
      verdict: r.blocked ? "BLOCK" : "ALLOW",
      detail: r.blocked
        ? r.findings.filter((f) => !f.ok).map((f) => f.constraint).join("; ")
        : `all ${r.findings.length} constraints satisfied · ${r.outcome.slippagePct.toFixed(1)}% vs reference`,
    });
  }

  async function execute(solo: boolean) {
    if (!res) return;
    setBusy("exec");
    const r = await fetch("/api/execute", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ mandate, scenario: res.scenario, solo }),
    }).then((x) => x.json());
    if (r.state) setS(r.state);
    const msg = r.ok
      ? solo ? "Settled without the policy service — this should not happen." : "Policy service co-signed. Settled on devnet."
      : r.reason ?? r.error ?? "failed";
    setExec({ ok: r.ok, msg, explorer: r.explorer });
    log({
      ts: new Date().toISOString(), scenario: res.scenario, hash: res.mandateHash,
      verdict: r.ok ? "SETTLED" : solo ? "REJECTED ON-CHAIN" : "REFUSED TO CO-SIGN",
      detail: msg, explorer: r.explorer,
    });
    setBusy(null);
  }

  const o = res?.outcome;
  const solx = res?.oracle?.SOLX;

  return (
    <div className="wrap">
      <header className="hero">
        <span className="tag">Solana devnet · live Pyth · 2-of-2 token multisig</span>
        <h1>Mandate</h1>
        <p className="pitch">Every agent control on Solana asks how much. None of them ask what you got back.</p>
        <p className="sub">
          The Foundation&apos;s Allowances program, Squads hooks, Swig roles and Ledger&apos;s Agent Stack all check
          <em> who</em> may act, <em>where</em>, and <em>how much</em>. None of them evaluate the execution price
          against a reference. So an agent can lose a vault without exceeding a single limit. Mandate compiles what
          the agent may do, simulates the transaction against devnet, values the result against a live oracle, and
          co-signs only if the outcome holds up.
        </p>
      </header>

      <div className="grid">
        <div>
          <section className="panel">
            <h2>The mandate</h2>
            <textarea value={mandate} onChange={(e) => setMandate(e.target.value)} spellCheck={false} rows={7} />
            <p className="note">
              A constrained grammar, not a language model. A mandate is a security artifact: it has to be reviewable
              and diffable, and it is hashed into every audit record. Natural language belongs above this as
              authoring sugar, not underneath it as the source of truth.
            </p>
          </section>

          <section className="panel" style={{ marginTop: 20 }}>
            <h2>Agent proposes</h2>
            <div className="scenarios">
              {SCENARIOS.map((x) => (
                <button key={x.id} onClick={() => preflight(x.id)} disabled={!!busy}>
                  {busy === x.id ? "simulating…" : x.label} <span className="k">· {x.hint}</span>
                </button>
              ))}
            </div>
          </section>

          {s && (
            <section className="panel" style={{ marginTop: 20 }}>
              <h2>Who can move this vault</h2>
              <div className="stat"><span className="k">Delegate</span>
                <span className={`v ${s.delegateIsMultisig ? "ok" : "bad"}`}>
                  {s.delegateIsMultisig ? "2-of-2 SPL Token multisig" : "not a multisig"}
                </span></div>
              <div className="stat"><span className="k">Signer 1 — agent</span><span className="v"><a href={ex(s.agentPubkey)} target="_blank" rel="noreferrer">{s.agentPubkey.slice(0, 6)}…</a></span></div>
              <div className="stat"><span className="k">Signer 2 — policy service</span><span className="v"><a href={ex(s.policyPubkey)} target="_blank" rel="noreferrer">{s.policyPubkey.slice(0, 6)}…</a></span></div>
              <div className="stat"><span className="k">Allowance left</span><span className="v accent">{n2(s.allowanceRemaining)} gUSD</span></div>
              <div className="stat"><span className="k">Vault balance</span><span className="v">{n2(s.vaultBalance)} gUSD</span></div>
              <p className="note">
                The delegate is the multisig, not the agent. The SPL Token program refuses any transfer this service
                has not co-signed, so the verifier cannot be skipped by the thing it verifies.
              </p>
            </section>
          )}

          {solx && (
            <section className="panel" style={{ marginTop: 20 }}>
              <h2>Oracle</h2>
              <div className="stat"><span className="k">SOLX reference</span><span className="v chain">${solx.priceable ? n2(solx.price!) : "—"}</span></div>
              <div className="stat"><span className="k">Source</span><span className="v">{solx.source}</span></div>
              {solx.feed && <div className="stat"><span className="k">Feed account</span><span className="v"><a href={ex(solx.feed)} target="_blank" rel="noreferrer">{solx.feed.slice(0, 6)}…</a></span></div>}
              <div className="stat"><span className="k">SCAM</span><span className="v bad">unpriceable</span></div>
            </section>
          )}
        </div>

        <div>
          {!res && <section className="panel"><h2>Verdict</h2><p className="empty">run a scenario to simulate it against devnet.</p></section>}

          {res && o && (
            <>
              <section className="panel">
                <h2>What the simulation says will happen</h2>
                <div className="stat"><span className="k">Proposed</span><span className="v">{res.label}</span></div>
                {o.legs.filter((l) => Math.abs(l.delta) > 1e-9).map((l) => (
                  <div className="stat" key={l.symbol}>
                    <span className="k">{l.delta < 0 ? "Vault pays" : "Vault receives"}</span>
                    <span className={`v ${l.delta < 0 ? "" : l.priceable ? "chain" : "bad"}`}>
                      {n2(Math.abs(l.delta))} {l.symbol}{" "}
                      <span className="k">{l.priceable ? `≈ ${n2(l.value)} gUSD` : "· no oracle price"}</span>
                    </span>
                  </div>
                ))}
                <div className="stat"><span className="k">Paid vs received, at reference</span>
                  <span className={`v ${o.slippagePct > 2 ? "bad" : "ok"}`}>{n2(o.valueOut)} → {n2(o.valueIn)} ({o.slippagePct.toFixed(1)}%)</span></div>
              </section>

              <section className="panel" style={{ marginTop: 20 }}>
                <h2>Does anything else check this?</h2>
                {res.controls.map((c) => (
                  <div className="stat" key={c.name}>
                    <span className="k">{c.name}<br /><span style={{ opacity: .65 }}>{c.checks}</span></span>
                    <span className={`v badge ${c.pricesFill ? "ok" : "bad"}`}>{c.pricesFill ? "prices the fill" : "does not"}</span>
                  </div>
                ))}
                <p className="note">
                  Narrow on purpose. Squads hooks and Swig roles can block an unknown program or asset — the claim
                  here is only that none of them value what the vault receives.
                </p>
              </section>

              <section className="panel" style={{ marginTop: 20 }}>
                <h2>What the mandate says</h2>
                {res.findings.map((f) => (
                  <div className={`entry ${f.ok ? "pass" : "chainblock"}`} key={f.constraint}>
                    <div className="head"><strong>{f.constraint}</strong>
                      <span className={`badge ${f.ok ? "ok" : "bad"}`}>{f.ok ? "ok" : "violated"}</span></div>
                    <div className="why">{f.detail}</div>
                  </div>
                ))}
                <div style={{ marginTop: 14 }}>
                  <button className="primary" onClick={() => execute(false)} disabled={!!busy}>
                    {busy === "exec" ? "…" : res.blocked ? "Ask the policy service to co-sign" : "Co-sign and settle on devnet"}
                  </button>
                  {res.blocked && (
                    <button className="danger" onClick={() => execute(true)} disabled={!!busy}>
                      Agent bypasses the policy service and signs alone
                    </button>
                  )}
                </div>
                {exec && (
                  <div className={`entry ${exec.ok ? "pass" : "chainblock"}`} style={{ marginTop: 12 }}>
                    <div className="why">{exec.msg}</div>
                    {exec.explorer && <div className="why"><a href={exec.explorer} target="_blank" rel="noreferrer">view transaction ↗</a></div>}
                  </div>
                )}
              </section>
            </>
          )}

          <section className="panel" style={{ marginTop: 20 }}>
            <h2>Audit record</h2>
            {audit.length === 0 && <p className="empty">every verdict is recorded here, allows included.</p>}
            <div className="log">
              {audit.map((a, i) => (
                <div className={`entry ${a.verdict === "ALLOW" || a.verdict === "SETTLED" ? "pass" : "chainblock"}`} key={i}>
                  <div className="head">
                    <strong>{a.scenario}</strong>
                    <span className={`badge ${a.verdict === "ALLOW" || a.verdict === "SETTLED" ? "ok" : "bad"}`}>{a.verdict}</span>
                  </div>
                  <div className="why">{a.detail}</div>
                  <div className="why" style={{ opacity: .6 }}>mandate {a.hash} · {a.ts.replace("T", " ").slice(0, 19)}Z</div>
                </div>
              ))}
            </div>
            <p className="note">
              Session-local for now. Anchoring these to the agent&apos;s Agent Registry identity through the
              Validation Registry is the next step, and it is the only asset here that compounds.
            </p>
          </section>
        </div>
      </div>

      <footer>
        The cumulative spend ceiling is deliberately not our contribution — the Foundation&apos;s audited
        Subscriptions &amp; Allowances program shipped that in June 2026 and we assume it underneath.
        <br />Constraint evaluation runs off-chain in the policy service; what is on-chain is the requirement that
        it sign at all. A compromised policy key is the remaining trust assumption, and moving evaluation into an
        audited program is the next layer. Stated plainly in the README rather than implied away.
      </footer>
    </div>
  );
}

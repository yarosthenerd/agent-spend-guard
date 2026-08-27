"use client";

import { useCallback, useEffect, useState } from "react";

const DEFAULT_MANDATE = `allow programs: spl-token, memo
allow mints: gUSD, SOLX
max slippage 2%
max trade 500 gUSD
max position 25% of vault
halt on drawdown 10%`;

type Finding = { constraint: string; ok: boolean; detail: string };
type Leg = { symbol: string; delta: number; value: number; price: number };
type Result = {
  label: string; note: string; blocked: boolean;
  swap: { spend: number; receiveSymbol: string; receiveAmount: number };
  outcome: { legs: Leg[]; valueOut: number; valueIn: number; slippagePct: number; drawdownPct: number; programIds: string[] };
  findings: Finding[];
  incumbents: { name: string; checks: string; ok: boolean }[];
  state: State;
};
type State = { vaultBalance: number; allowanceRemaining: number; agentIsDelegate: boolean; vaultAta: string; agentPubkey: string; mint: string };

const ex = (a: string) => `https://explorer.solana.com/address/${a}?cluster=devnet`;
const n2 = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

export default function Page() {
  const [mandate, setMandate] = useState(DEFAULT_MANDATE);
  const [s, setS] = useState<State | null>(null);
  const [res, setRes] = useState<Result | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [exec, setExec] = useState<{ ok: boolean; msg: string; explorer?: string } | null>(null);
  const [scenario, setScenario] = useState<"good" | "drain" | null>(null);

  const refresh = useCallback(async () => {
    const r = await fetch("/api/state", { cache: "no-store" });
    if (r.ok) setS(await r.json());
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  async function preflight(sc: "good" | "drain") {
    setBusy(sc); setExec(null); setScenario(sc);
    const r = await fetch("/api/preflight", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ mandate, scenario: sc }),
    }).then((x) => x.json());
    if (r.state) setS(r.state);
    setRes(r.error ? null : r);
    setBusy(null);
  }

  async function execute(override: boolean) {
    if (!scenario) return;
    setBusy("exec");
    const r = await fetch("/api/execute", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ mandate, scenario, override }),
    }).then((x) => x.json());
    if (r.state) setS(r.state);
    setExec(r.ok
      ? { ok: true, msg: r.overridden ? "Signed over the mandate's objection. The value is gone — this is what the block prevents." : "Mandate satisfied. Settled on devnet.", explorer: r.explorer }
      : { ok: false, msg: r.reason ?? r.error ?? "failed" });
    setBusy(null);
  }

  const o = res?.outcome;

  return (
    <div className="wrap">
      <header className="hero">
        <span className="tag">Solana devnet · simulated against live RPC</span>
        <h1>Mandate</h1>
        <p className="pitch">Spending caps check the amount. Mandates check the outcome.</p>
        <p className="sub">
          Every agent control shipping today is denominated in transfer amounts — the Foundation&apos;s Allowances
          program, Squads spending limits, Swig roles. An agent can lose a whole vault without exceeding any of
          them: swap into a worthless mint, eat 40% slippage, over-concentrate. Mandate compiles what the agent is
          allowed to <em>do</em>, simulates every transaction against devnet before it is signed, and blocks on the
          outcome the simulation actually produces.
        </p>
      </header>

      <div className="grid">
        <div>
          <section className="panel">
            <h2>The mandate</h2>
            <textarea value={mandate} onChange={(e) => setMandate(e.target.value)} spellCheck={false} rows={7} />
            <p className="note">
              A constrained grammar, not a language model. Edit it and re-run — loosen the slippage bound to 50%
              or add SCAM to the allowed mints and the block disappears.
            </p>
          </section>

          <section className="panel" style={{ marginTop: 20 }}>
            <h2>Agent proposes</h2>
            <div className="scenarios">
              <button onClick={() => preflight("good")} disabled={!!busy}>
                {busy === "good" ? "simulating…" : "✓ Rebalance 50 gUSD into SOLX"}
              </button>
              <button onClick={() => preflight("drain")} disabled={!!busy}>
                {busy === "drain" ? "simulating…" : "☠ Swap the full 500 allowance into SCAM"}
              </button>
            </div>
            <p className="note">
              The second one spends <strong>exactly</strong> its allowance. It exceeds no limit anywhere.
              That is the attack every amount-based control is blind to.
            </p>
          </section>

          {s && (
            <section className="panel" style={{ marginTop: 20 }}>
              <h2>Vault</h2>
              <div className="stat"><span className="k">Balance</span><span className="v">{n2(s.vaultBalance)} gUSD</span></div>
              <div className="stat"><span className="k">Agent allowance left</span><span className="v accent">{n2(s.allowanceRemaining)} gUSD</span></div>
              <div className="stat"><span className="k">Vault account</span><span className="v"><a href={ex(s.vaultAta)} target="_blank" rel="noreferrer">explorer ↗</a></span></div>
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
                    <span className={`v ${l.delta < 0 ? "" : "chain"}`}>
                      {n2(Math.abs(l.delta))} {l.symbol} <span className="k">≈ {n2(l.value)} gUSD @ {l.price}</span>
                    </span>
                  </div>
                ))}
                <div className="stat">
                  <span className="k">Value in vs out</span>
                  <span className={`v ${o.slippagePct > 2 ? "bad" : "ok"}`}>{n2(o.valueOut)} → {n2(o.valueIn)} ({o.slippagePct.toFixed(1)}% loss)</span>
                </div>
              </section>

              <section className="panel" style={{ marginTop: 20 }}>
                <h2>What today&apos;s controls say</h2>
                {res.incumbents.map((i) => (
                  <div className="stat" key={i.name}>
                    <span className="k">{i.name}<br /><span style={{ opacity: .65 }}>checks {i.checks}</span></span>
                    <span className={`v badge ${i.ok ? "ok" : "bad"}`}>{i.ok ? "allow" : "block"}</span>
                  </div>
                ))}
                <p className="note">Modelled from public documentation, not live integrations. All of them ask how much.</p>
              </section>

              <section className="panel" style={{ marginTop: 20 }}>
                <h2>What the mandate says</h2>
                {res.findings.map((f) => (
                  <div className={`entry ${f.ok ? "pass" : "chainblock"}`} key={f.constraint}>
                    <div className="head">
                      <strong>{f.constraint}</strong>
                      <span className={`badge ${f.ok ? "ok" : "bad"}`}>{f.ok ? "ok" : "violated"}</span>
                    </div>
                    <div className="why">{f.detail}</div>
                  </div>
                ))}
                <div style={{ marginTop: 14 }}>
                  <button className="primary" onClick={() => execute(false)} disabled={!!busy}>
                    {busy === "exec" ? "…" : res.blocked ? "Sign it (mandate will refuse)" : "Sign and settle on devnet"}
                  </button>
                  {res.blocked && (
                    <button className="danger" onClick={() => execute(true)} disabled={!!busy}>
                      Override the mandate and sign anyway
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
        </div>
      </div>

      <footer>
        Enforcement here is <strong>pre-flight</strong>: the mandate is checked against a real devnet simulation before
        signing. That stops a misbehaving agent, not a compromised one — moving these constraints into an audited
        program is the next layer, and it is stated plainly in the README rather than implied away.
        <br />The cumulative spend ceiling is deliberately <em>not</em> our contribution; the Foundation&apos;s
        Allowances program shipped that, audited, in June 2026.
      </footer>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";

type State = {
  mint: string; symbol: string; ownerPubkey: string; agentPubkey: string; venuePubkey: string;
  vaultAta: string; vaultBalance: number; venueBalance: number;
  delegate: string | null; allowanceRemaining: number; agentIsDelegate: boolean;
};
type Entry = {
  id: number; label: string; amount: number;
  verdict: "pass" | "policy" | "chainblock"; why: string; sig?: string; explorer?: string;
};

const ex = (a: string) => `https://explorer.solana.com/address/${a}?cluster=devnet`;
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

export default function Page() {
  const [s, setS] = useState<State | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<Entry[]>([]);
  const [grant, setGrant] = useState(500);
  const [perTxCap, setPerTxCap] = useState(100);
  const [dailyCap, setDailyCap] = useState(300);
  const [spentToday, setSpentToday] = useState(0);

  const refresh = useCallback(async () => {
    const r = await fetch("/api/state", { cache: "no-store" });
    if (r.ok) setS(await r.json());
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const push = (e: Omit<Entry, "id">) => setLog((l) => [{ ...e, id: Date.now() + Math.random() }, ...l]);

  async function grantAllowance() {
    setBusy("grant");
    const r = await fetch("/api/allowance", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount: grant }),
    }).then((x) => x.json());
    if (r.state) setS(r.state);
    setSpentToday(0);
    push({
      label: "Owner granted allowance", amount: grant,
      verdict: r.ok ? "pass" : "chainblock",
      why: r.ok ? `Agent may now spend up to ${grant} gUSD. Enforced by SPL Token.` : r.error ?? "failed",
      sig: r.sig, explorer: r.explorer,
    });
    setBusy(null);
  }

  async function trade(amount: number, label: string, destination?: string, bypassPolicy = false) {
    if (!s) return;
    setBusy(label);
    const dest = destination ?? s.venuePubkey;
    const r = await fetch("/api/trade", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        amount, destination: dest,
        policy: bypassPolicy
          ? { perTxCap: 1e9, dailyCap: 1e9, allowlist: [dest] }
          : { perTxCap, dailyCap, allowlist: [s.venuePubkey] },
        spentToday,
      }),
    }).then((x) => x.json());

    if (r.state) setS(r.state);
    if (r.ok) setSpentToday((v) => v + amount);
    push({
      label, amount,
      verdict: r.ok ? "pass" : r.layer === "policy" ? "policy" : "chainblock",
      why: r.ok ? `Settled on devnet. Policy ${r.policyHash} committed on-chain.` : r.reason ?? r.error ?? "failed",
      sig: r.sig, explorer: r.explorer,
    });
    setBusy(null);
  }

  async function revoke() {
    setBusy("revoke");
    const r = await fetch("/api/revoke", { method: "POST" }).then((x) => x.json());
    if (r.state) setS(r.state);
    push({
      label: "Owner pulled the kill switch", amount: 0,
      verdict: r.ok ? "pass" : "chainblock",
      why: r.ok ? "Delegate revoked on-chain. The agent has no authority left." : r.error ?? "failed",
      sig: r.sig, explorer: r.explorer,
    });
    setBusy(null);
  }

  const granted = s?.agentIsDelegate ? s.allowanceRemaining : 0;
  const pct = grant > 0 ? Math.min(100, (granted / grant) * 100) : 0;

  return (
    <div className="wrap">
      <header className="hero">
        <span className="tag">Solana devnet · live</span>
        <h1>Agent Spend-Guard</h1>
        <p className="pitch">Give your trading agent an allowance, not your wallet.</p>
        <p className="sub">
          Autonomous trading agents today are handed a private key and trusted to behave. This hands them an
          SPL Token <strong>delegate allowance</strong> instead: a hard ceiling the token program itself enforces,
          plus a one-instruction kill switch. The agent signs its own trades and never holds custody.
          Every button below sends a real transaction to Solana devnet.
        </p>
      </header>

      <div className="grid">
        <div>
          <section className="panel">
            <h2>Vault</h2>
            {!s ? <p className="empty">connecting to devnet…</p> : (
              <>
                <div className="stat">
                  <span className="k">Allowance remaining</span>
                  <span className={`v big ${granted > 0 ? "accent" : "bad"}`}>{granted.toLocaleString()}</span>
                </div>
                <div className="meter"><i style={{ width: `${pct}%` }} /></div>
                <div className="stat">
                  <span className="k">Vault balance</span>
                  <span className="v">{s.vaultBalance.toLocaleString()} {s.symbol}</span>
                </div>
                <div className="stat">
                  <span className="k">Agent has spent (today)</span>
                  <span className="v">{spentToday.toLocaleString()} {s.symbol}</span>
                </div>
                <div className="stat">
                  <span className="k">Venue received</span>
                  <span className="v">{s.venueBalance.toLocaleString()} {s.symbol}</span>
                </div>
                <div className="stat">
                  <span className="k">On-chain delegate</span>
                  <span className={`v ${s.agentIsDelegate ? "ok" : "bad"}`}>
                    {s.delegate ? <a href={ex(s.delegate)} target="_blank" rel="noreferrer">{short(s.delegate)}</a> : "none · revoked"}
                  </span>
                </div>
                <div className="stat">
                  <span className="k">Vault account</span>
                  <span className="v"><a href={ex(s.vaultAta)} target="_blank" rel="noreferrer">{short(s.vaultAta)}</a></span>
                </div>
              </>
            )}
          </section>

          <section className="panel" style={{ marginTop: 20 }}>
            <h2>Owner controls</h2>
            <label>Allowance to grant (gUSD)</label>
            <input type="number" value={grant} onChange={(e) => setGrant(+e.target.value)} />
            <div className="row">
              <div>
                <label>Per-trade cap</label>
                <input type="number" value={perTxCap} onChange={(e) => setPerTxCap(+e.target.value)} />
              </div>
              <div>
                <label>Daily cap</label>
                <input type="number" value={dailyCap} onChange={(e) => setDailyCap(+e.target.value)} />
              </div>
            </div>
            <button className="primary" onClick={grantAllowance} disabled={!!busy || !s}>
              {busy === "grant" ? "signing…" : "Grant allowance on-chain"}
            </button>
            <button className="danger" onClick={revoke} disabled={!!busy || !s?.agentIsDelegate}>
              {busy === "revoke" ? "revoking…" : "⏻ Revoke — kill switch"}
            </button>
            <p className="note">
              Caps are enforced by this service. The allowance ceiling and the revoke are enforced by the
              SPL Token program, and hold even if this service is fully compromised.
            </p>
          </section>
        </div>

        <div>
          <section className="panel">
            <h2>Agent actions</h2>
            <div className="scenarios">
              <button onClick={() => trade(50, "Agent buys — within limits")} disabled={!!busy || !s}>
                ✓ Normal trade · 50 gUSD
              </button>
              <button onClick={() => trade(250, "Agent buys — oversized")} disabled={!!busy || !s}>
                ⚠ Oversized trade · 250 gUSD <span className="accent">→ policy should block</span>
              </button>
              <button
                onClick={() => s && trade(50, "Agent pays an unknown address", "11111111111111111111111111111111")}
                disabled={!!busy || !s}
              >
                ⚠ Pay unlisted address · 50 gUSD <span className="accent">→ allowlist should block</span>
              </button>
              <button
                onClick={() => trade(Math.max(grant + 1000, 5000), "Agent tries to drain the vault", undefined, true)}
                disabled={!!busy || !s}
              >
                ☠ Drain attempt · {Math.max(grant + 1000, 5000).toLocaleString()} gUSD{" "}
                <span className="bad">→ policy layer bypassed, chain must hold</span>
              </button>
            </div>
            <p className="note">
              The drain attempt is the one that matters: it ships with the policy layer deliberately switched off,
              simulating a fully compromised signer service. Solana still refuses to settle it.
            </p>
          </section>

          <section className="panel" style={{ marginTop: 20 }}>
            <h2>Activity</h2>
            <div className="log">
              {log.length === 0 && <p className="empty">no activity yet — grant an allowance, then run the agent.</p>}
              {log.map((e) => (
                <div key={e.id} className={`entry ${e.verdict}`}>
                  <div className="head">
                    <strong>{e.label}</strong>
                    <span className={`badge ${e.verdict === "pass" ? "ok" : e.verdict === "policy" ? "accent" : "bad"}`}>
                      {e.verdict === "pass" ? "settled" : e.verdict === "policy" ? "blocked · policy" : "blocked · chain"}
                    </span>
                  </div>
                  <div className="why">{e.why}</div>
                  {e.explorer && (
                    <div className="why">
                      <a href={e.explorer} target="_blank" rel="noreferrer">view transaction on Solana Explorer ↗</a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <footer>
        {s && (
          <>
            gUSD mint <a href={ex(s.mint)} target="_blank" rel="noreferrer">{short(s.mint)}</a> ·
            {" "}owner <a href={ex(s.ownerPubkey)} target="_blank" rel="noreferrer">{short(s.ownerPubkey)}</a> ·
            {" "}agent <a href={ex(s.agentPubkey)} target="_blank" rel="noreferrer">{short(s.agentPubkey)}</a> ·
            {" "}venue <a href={ex(s.venuePubkey)} target="_blank" rel="noreferrer">{short(s.venuePubkey)}</a>
          </>
        )}
        <br />Solana devnet · no custom program · enforcement by SPL Token delegate + revoke.
      </footer>
    </div>
  );
}

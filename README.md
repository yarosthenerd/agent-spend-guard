# Mandate

**Spending caps check the amount. Mandates check the outcome.**

**Live demo:** https://agent-spend-guard-yaros3920-9222s-projects.vercel.app

Solana **devnet** · every verdict comes from a real `simulateTransaction` against live RPC · no wallet needed.

---

## The gap

Every agent spending control shipping today is denominated in **transfer amounts**:

- **Solana Foundation — Subscriptions & Allowances** (audited, mainnet, June 2 2026): a cumulative cap plus expiry.
- **Squads v5 spending limits**: per-period amount caps.
- **Swig policy roles**: which programs an agent may call.
- Every "agent wallet with guardrails" launched this year, including our own first version.

An agent can lose 100% of a vault **without exceeding any of them**. Swap into a worthless mint. Eat 40%
slippage. Get sandwiched. Over-concentrate into one position. LP into a rug. Every one of those transactions
is fully authorized and within budget. The cap asks *how much*. It never asks *in exchange for what*.

This is not hypothetical. The 2026 agent losses were not ceiling breaches. In the Bankr/Grok incident the
transfer limits were **bypassed by permission escalation, not exceeded** — every transaction was authorized,
it just wasn't what the owner meant. AI agent protocol exploits produced $45M+ in losses through H1 2026.
No spending cap addresses that class, because a cap checks amount and the failure was intent.

## What Mandate does

The owner declares what the agent may **do**. Mandate compiles it to machine-checkable constraints,
**simulates the agent's transaction against devnet before anything is signed**, decodes the true post-state
balance deltas, and evaluates the constraints against the outcome the simulation actually produces.

```
allow programs: spl-token, memo
allow mints: gUSD, SOLX
max slippage 2%
max trade 500 gUSD
max position 25% of vault
halt on drawdown 10%
```

## The demo, and the test that matters

Our previous version tested a 5,000 drain against a 500 allowance. The chain blocked it. That was the wrong
test — **a real attacker takes exactly 500.** So that is what the demo does now:

> The agent proposes swapping its **entire 500 gUSD allowance** into a worthless mint at a 40% loss.
> It exceeds no limit. It spends precisely what it was authorized to spend.

| Control | Checks | Verdict |
|---|---|---|
| Foundation Allowances (fixed delegation) | cumulative cap + expiry | **allow** |
| Squads v5 spending limits | per-period amount cap | **allow** |
| Swig policy roles | which programs may be called | **allow** |
| Spend-Guard v1 (SPL delegate ceiling) | cumulative cap | **allow** |
| **Mandate** | **simulated outcome** | **block** |

Mandate's own amount constraint (`max trade 500 gUSD`) **passes** — that is deliberate. The block comes from
`allow mints` and `max slippage`, evaluated against the simulated result. Amount checking is not the contribution.

There is an **override** button. Press it and the transaction really settles on devnet and the value really
leaves the vault, with an explorer link. The block is not theater.

## Honest limits

- **Enforcement is pre-flight, not on-chain.** Mandate stops a *misbehaving* agent, not a *compromised* one:
  an attacker holding the agent key can bypass this service and sign directly, bounded only by the delegate
  ceiling underneath. Moving these constraints into an audited program that custodies the capital is the next
  layer, and it is the actual product. Advisory first, on-chain as the constraint set proves itself.
- **We do not compete on the allowance primitive.** The Foundation's program is free, audited, multi-delegate
  and Token-2022 compatible. We assume it underneath rather than reimplement it.
- **The mandate grammar is deterministic, not a language model.** A natural-language front-end is the obvious
  next layer; faking it with no model behind it would be a demo, not a check.
- **Reference prices for the demo mints are quoted constants**, labelled as such in the UI. The same field is
  populated from Pyth Hermes for real mints.
- **Incumbent verdicts are modelled from public documentation**, not live integrations.
- Keys are server-held so judges can click through without a wallet. Nothing in the design requires it.

## Why this is defensible

Squads is treasury and payments infrastructure. Swig is roles and permissions — *who* may act, not whether
the action is economically sane. The Foundation's program is explicitly built for recurring billing, payroll
and subscriptions; it will never grow venue allowlists, oracle-referenced slippage bounds or drawdown circuit
breakers, because those are not payments features.

Enforcement over **outcomes** rather than transfer amounts is the part of this problem nobody above us has
absorbed. It also compounds: every mandate enforced produces a verifiable record of what an agent tried to do
and what got blocked, which is exactly the corpus the Agent Registry's Validation Registry exists to anchor.

## How it works

1. `lib/mandate.ts` — grammar, compiler, and evaluator over an `Outcome`.
2. `lib/preflight.ts` — builds the trade as an atomic two-leg swap, runs `simulateTransaction` with account
   inspection, decodes `AccountLayout` post-state, and derives value deltas, slippage, concentration, drawdown.
3. `app/api/preflight` — compile, simulate, evaluate, and compute the incumbent comparison.
4. `app/api/execute` — signs **only** if the simulated outcome satisfies the mandate, unless explicitly overridden.

## Run it

```bash
npm install --ignore-scripts
node scripts/setup.mjs    # gUSD mint, vault, delegate funding
node scripts/setup2.mjs   # SOLX and SCAM mints, venue inventory
npm run dev
```

Requires `keys/devnet-keys.json` with base58 secrets for OWNER / AGENT / VENUE and the owner funded with
devnet SOL. Both scripts write to `.env.local`.

## Stack

Next.js · TypeScript · `@solana/web3.js` · `@solana/spl-token` · Solana devnet · Vercel

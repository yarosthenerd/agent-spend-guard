# Mandate

**Every agent control on Solana asks how much. None of them ask what you got back.**

**Live demo:** https://agent-spend-guard-yaros3920-9222s-projects.vercel.app

Solana **devnet** · every verdict comes from a real `simulateTransaction` against live RPC · no wallet needed.

---

## The gap

Every agent spending control shipping today is denominated in **transfer amounts**:

- **Solana Foundation — Subscriptions & Allowances** (audited by Cantina/Spearbit, mainnet, June 2 2026):
  cumulative cap, expiry, multi-delegate, Token-2022 including confidential transfers.
- **Squads v5 hooks**: program whitelists, per-period caps, approval thresholds by transaction type.
- **Swig**: an on-chain policy engine over roles, assets and program interactions.
- **Turnkey / Privy / Ledger Agent Stack**: scoped keys and hardware approval.

Between them they cover *who* may act, *where*, and *how much*. **None of them value what the vault receives.**
So an agent can lose a vault without exceeding a single limit: take a 40% worse fill than the oracle reference,
or end up holding a position nothing can price. Every one of those transactions is fully authorized and inside
budget. The cap asks *how much*. It never asks *in exchange for what*.

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

## The claim, scoped so it survives a reader who knows the changelogs

The temptation is to say the incumbents would wave these trades through. That is not true and would sink the
rest of the argument: Squads v5 hooks ship program whitelists, and Swig's roles cover specific assets and
program interactions. Either can block an unknown mint.

The defensible claim is narrower and enough:

| Control | What it checks | Values the fill? |
|---|---|---|
| Foundation — Subscriptions & Allowances | cumulative cap, expiry, multi-delegate | no |
| Squads v5 — hooks | program whitelist, per-period caps, approval thresholds | no |
| Swig — policy roles | which programs and assets an agent may touch | no |
| Turnkey / Ledger Agent Stack | who holds the key, which device approves | no |
| **Mandate** | **the simulated outcome, valued against an oracle** | **yes** |

They check *who*, *where*, and *how much*. None of them check what came back.

## Three rules, three demos

Each button is a distinct constraint, so "mandate" reads as a category rather than one hardcoded check.

1. **Buy SOLX at the reference price** — fill within 0.4% of the live Pyth SOL/USD feed. Every constraint
   passes, the policy service co-signs, it settles on devnet.
2. **Buy SOLX 40% below reference** — a real mint, a real feed, a real implied execution price 40% off.
   `max slippage 2%` fires. Nothing about this is estimated: the reference comes from the on-chain Pyth
   account and the fill comes from the simulated post-state.
3. **Swap the allowance into an unpriceable mint** — no approved oracle publishes a price, so the resulting
   position cannot be valued at all. `require oracle pricing` fires. This is deliberately *not* a mint
   allowlist, which is the commoditized version of the same idea; it is a rule about whether the vault can
   still be risk-checked after the trade.

Rule 2 is the one that proves the thesis, because every input to it is real. Note that the amount constraint
(`max trade 500 gUSD`) **passes** in both blocked cases. Amount checking is not the contribution.

## Every verdict is recorded, allows included

Each decision writes a structured record: mandate hash, scenario, simulated deltas, which rule fired, verdict,
timestamp. Allows are recorded as deliberately as blocks — a track record of constrained execution that a third
party can check is the only asset in this category that compounds, and it is what the Agent Registry's
Validation Registry exists to anchor. Session-local in this build; anchoring it to the agent's on-chain
identity is the next step.

## Honest limits

- **Constraint evaluation is still off-chain.** What is on-chain is the *requirement that the policy service
  sign at all*. A compromised policy key is the remaining trust assumption. Moving evaluation itself into an
  audited program is the next layer, and it is the actual product.
- **Slippage bounds are checked at approval, not at execution.** Against a real AMM the fix is to rewrite
  `minOutAmount` to whatever the mandate permits before co-signing, so the AMM enforces the bound at execution
  time rather than our RPC call enforcing it at approval time. Our two-leg swap has no `minOut` field to bind,
  so this is documented rather than demonstrated.
- **We do not compete on the allowance primitive.** The Foundation's program is free, audited, multi-delegate
  and Token-2022 compatible. We assume it underneath rather than reimplement it.
- **The mandate grammar is deterministic by design, not by constraint.** A mandate is a security artifact: it
  has to be reviewable, diffable, and hashable into an audit record. Natural language belongs *above* it as
  authoring sugar, never underneath it as the source of truth. That is the position we would hold with
  unlimited time, not a limitation we are working around.
- **SOLX is priced from a live Pyth feed read on-chain** (devnet SOL/USD, account
  `J83w4HKfqxwcq3BEMMkPFSppX3gqekLyLJBexebFVkix`). gUSD is the unit of account and quoted at par by definition.
  SCAM has no feed, which is the point of the third rule rather than a gap.
- **What other products check is described from public documentation**, not live integrations — and the claim
  is deliberately narrow. See below.
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
2. `lib/oracle.ts` — reads Pyth price accounts directly from devnet RPC and reports unpriceable mints as such.
3. `lib/preflight.ts` — builds the trade as an atomic two-leg swap authorised by the multisig delegate, then
   simulates it unsigned (`sigVerify: false`, `replaceRecentBlockhash: true`, `accounts` listing the vault's
   token accounts), decodes `AccountLayout` post-state, and derives value deltas, slippage, concentration
   and drawdown.
4. `app/api/preflight` — compile, simulate, value against the oracle, evaluate, record.
5. `app/api/execute` — the policy service co-signs **only** if the simulated outcome satisfies the mandate.
   `solo: true` demonstrates the agent attempting to sign without it, which the token program rejects.

## Run it

```bash
npm install --ignore-scripts
node scripts/setup.mjs    # gUSD mint, vault, delegate funding
node scripts/setup2.mjs   # SOLX and SCAM mints, venue inventory
node scripts/ms-test.mjs  # creates the 2-of-2 multisig delegate and proves both directions
npm run dev
```

Requires `keys/devnet-keys.json` with base58 secrets for OWNER / AGENT / VENUE and the owner funded with
devnet SOL. Both scripts write to `.env.local`.

## Stack

Next.js · TypeScript · `@solana/web3.js` · `@solana/spl-token` · Solana devnet · Vercel

# Mandate

**Every agent control on Solana asks how much. None of them ask what you got back.**

**Live demo:** https://agent-spend-guard-yaros3920-9222s-projects.vercel.app
**Repo:** https://github.com/yarosthenerd/agent-spend-guard

Solana **devnet** · live Pyth oracle read on-chain · 2-of-2 SPL Token multisig · no wallet install needed.

---

## The seven things worth knowing

1. **We solve a gap nobody above us has taken.** Every shipping agent control is denominated in transfer
   amounts. None of them value what the vault receives, so an agent can lose money without exceeding one limit.
2. **The verifier cannot be skipped by the thing it verifies.** The vault's delegate is a 2-of-2 SPL Token
   multisig, so the token program itself rejects any transfer the policy service hasn't co-signed. Verified
   on devnet: the agent signing alone gets `custom program error: 0x4`.
3. **The oracle is real.** The Pyth SOL/USD account is read directly from devnet RPC, and the slippage rule
   fires on that reference rather than a constant we picked. SOLX is our own mint standing in for SOL, which
   is the demo's one substitution and is labelled as such.
4. **The mandate counter-offers instead of only refusing.** When the price is the only problem, the policy
   service rewrites the trade to the worst fill the mandate permits and co-signs that transaction alone —
   structurally identical to binding `minOutAmount` before signing.
5. **The kill switch proves itself.** Revoke is one instruction enforced by the token program, and after
   revoking we attempt a fully co-signed transfer and report the on-chain rejection.
6. **We concede the primitive loudly.** The Foundation's audited Allowances program shipped the spend ceiling
   in June 2026. We assume it underneath rather than compete with it, and we say so on the landing page.
7. **Every verdict is recorded, allows included.** A checkable track record of constrained execution is the
   only asset in this category that compounds.

---

## The problem

Agent wallet security stopped being theoretical in 2026. AI agent protocol exploits produced $45M+ in losses
through H1. In May, an attacker sent an NFT to a Grok-linked wallet, which granted it "Executive" permissions
and **bypassed transfer limits**; a Morse-encoded instruction was decoded and executed, and ~$175,000 left the
wallet in seconds with no human in the loop.

The important detail: the limits were not *exceeded*. They were *sidestepped*. Every transaction was
authorized. It just wasn't what the owner meant. No spending cap addresses that, because a cap checks amount
and the failure was intent.

Meanwhile the amount-checking layer is solved and free:

- **Solana Foundation — Subscriptions & Allowances** (audited by Cantina/Spearbit, mainnet, June 2 2026):
  cumulative cap, expiry, multi-delegate, SPL Token and Token-2022 including confidential transfers.
- **Squads v5 hooks**: program whitelists, per-period caps, approval thresholds by transaction type.
- **Swig**: an on-chain policy engine over roles, assets and program interactions.
- **Turnkey / Privy / Ledger Agent Stack**: scoped keys and hardware approval.

Between them they cover *who* may act, *where*, and *how much*. **None of them value what the vault receives.**

## What Mandate does

The owner declares what the agent may **do**. Mandate compiles it to machine-checkable constraints, simulates
the agent's transaction against devnet before anything is signed, decodes the true post-state balance deltas,
values them against a live oracle, and co-signs only if the outcome holds up.

```
allow programs: spl-token, memo
require oracle pricing
max slippage 2%
max trade 500 gUSD
max position 25% of vault
halt on drawdown 10%
```

## The verifier cannot be skipped

The obvious objection to a pre-flight verifier is that the agent can simply not call it. So the agent is
architecturally unable to submit without us, and it costs one instruction and no custom program:

**The delegate is a 2-of-2 SPL Token multisig — agent + policy service — not the agent's pubkey.**

`spl_token::instruction::approve` accepts a multisig account as the delegate. The token program then requires
both signatures on every transfer from the vault. Enforcement of *who must agree* lives in the token program,
not in our service.

Verified on devnet, both directions:

| Attempt | Result |
|---|---|
| Agent + policy service co-sign | settles |
| Agent uses its own key as authority | **rejected on-chain, `custom program error: 0x4`** (owner mismatch) |

The demo exposes this as a button: when the mandate blocks a trade, you can tell the agent to bypass the
policy service and sign alone, and watch the token program refuse it.

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
   `max slippage 2%` fires. Nothing here is estimated: the reference comes from the on-chain Pyth account and
   the fill comes from the simulated post-state.
3. **Swap the allowance into an unpriceable mint** — no approved oracle publishes a price, so the resulting
   position cannot be valued at all. `require oracle pricing` fires. Deliberately *not* a mint allowlist,
   which is the commoditized version of the same idea; it is a rule about whether the vault can still be
   risk-checked after the trade.

Rule 2 proves the thesis, because every input to it is real. In both blocked cases the amount constraint
(`max trade 500 gUSD`) **passes**. Amount checking is not the contribution.

## The mandate can counter-offer, not just refuse

When the only thing wrong with a trade is the price, refusing it is a weak answer — the agent just tries
again. So the policy service states the worst fill it will accept and co-signs **that** transaction instead:

> The agent asked to receive 2.15 SOLX for 500 gUSD. At the oracle reference, `max slippage 2%` permits no
> worse than 3.50 SOLX. The policy service co-signs that transaction and only that one.

The agent never obtains a signature for its own version. This is **structurally identical to binding
`minOutAmount` before signing, and it maps to minOut on a real AMM** — the difference being that here the
policy service holds the venue key, where on an AMM it would write the bound into the swap instruction.

## Every verdict is recorded, allows included

Each decision writes a structured record: mandate hash, scenario, simulated deltas, which rule fired, verdict,
timestamp. Allows are recorded as deliberately as blocks — a track record of constrained execution that a
third party can check is the only asset in this category that compounds, and it is what the Agent Registry's
Validation Registry exists to anchor. Session-local in this build; anchoring it to the agent's on-chain
identity is the next step.

## Honest limits

- **Constraint evaluation is still off-chain.** What is on-chain is the *requirement that the policy service
  sign at all*. A compromised policy key is the remaining trust assumption. Moving evaluation itself into an
  audited program is the next layer, and it is the actual product.
- **Repair constrains the cooperative path, not every path.** The counter-offer works because the policy
  service also holds the venue's key in this demo, so it can sign a rewritten receive leg and refuse the
  agent's original. Against a real AMM the equivalent is binding `minOutAmount` into the swap instruction
  before co-signing — same mechanism, and we do not hold the venue key in that world. "We constrain
  execution" is the accurate claim. "The agent cannot transact without us" would be a stronger claim than
  this build supports, and we do not make it.
- **Slippage is bounded at approval, not at execution.** The repaired transaction is the one we co-sign, but
  nothing re-checks the price at landing. On a real AMM `minOutAmount` closes that gap; our two-leg swap has
  no such field.
- **The mandate grammar is deterministic by design, not by constraint.** A mandate is a security artifact: it
  has to be reviewable, diffable, and hashable into an audit record. Natural language belongs *above* it as
  authoring sugar, never underneath it as the source of truth. That is the position we would hold with
  unlimited time, not a limitation we are working around.
- **SOLX is our own devnet mint. There is no Pyth feed for it, and we do not pretend otherwise.** It is
  priced off the live Pyth **SOL/USD** feed as a stand-in (account
  `J83w4HKfqxwcq3BEMMkPFSppX3gqekLyLJBexebFVkix`), read on-chain from devnet RPC. The oracle read, the price,
  and the slippage arithmetic are all real; the mapping from SOLX to SOL is the demo's one substitution.
  gUSD is the unit of account, quoted at par by definition. SCAM has no feed at all, which is the point of
  rule 3 rather than a gap.
- **What other products check is described from public documentation**, not live integrations.
- **Keys are server-held** so judges can click through without a wallet. In production the owner key lives in
  the user's wallet and the policy key in the policy service; nothing in the design requires one host.
- **The hosted demo tops up its own allowance** when it runs low, so it survives being clicked indefinitely.
  That is a demo affordance, not a production behaviour.

## Why this is defensible

Squads is treasury and payments infrastructure at institutional scale. Swig is roles and permissions — *who*
may act, not whether a trade is economically sane. The Foundation's program is explicitly built for recurring
billing, payroll and subscriptions; it will never grow venue allowlists, oracle-referenced slippage bounds or
drawdown circuit breakers, because those are not payments features.

Enforcement over **outcomes** rather than transfer amounts is the part of this problem nobody above us has
absorbed. It also compounds: every mandate enforced produces a verifiable record of what an agent tried to do
and what got blocked, which is exactly the corpus the Validation Registry exists to anchor. That is the natural
on-ramp to underwriting and insurance for agent-managed capital.

## How it works

1. `lib/mandate.ts` — grammar, compiler, and evaluator over an `Outcome`.
2. `lib/oracle.ts` — reads Pyth price accounts directly from devnet RPC, cached per symbol, and reports
   unpriceable mints as such rather than defaulting them to zero.
3. `lib/preflight.ts` — builds the trade as an atomic two-leg swap authorised by the multisig delegate, then
   simulates it unsigned (`sigVerify: false`, `replaceRecentBlockhash: true`, `accounts` listing the vault's
   token accounts), decodes `AccountLayout` post-state, and derives value deltas, slippage, concentration and
   drawdown.
4. `app/api/preflight` — compile, simulate, value against the oracle, evaluate, record.
5. `app/api/execute` — the policy service co-signs **only** if the simulated outcome satisfies the mandate.
   `solo: true` demonstrates the agent attempting to sign without it, which the token program rejects.
6. `app/api/allowance` / `app/api/revoke` — the owner approves the multisig as delegate, or revokes it. The
   revoke path then immediately attempts a fully co-signed transfer and reports the on-chain failure, so the
   kill switch is demonstrated rather than asserted.
7. `app/api/reset` — puts the shared devnet vault back to a known state for the next visitor.

## Run it

```bash
npm install --ignore-scripts
node scripts/setup.mjs    # gUSD mint, vault, agent fee funding
node scripts/setup2.mjs   # SOLX and SCAM mints, venue inventory
node scripts/ms-test.mjs  # creates the 2-of-2 multisig delegate and proves both directions
npm run dev
```

Requires `keys/devnet-keys.json` with base58 secrets for OWNER / AGENT / VENUE, and the owner funded with
devnet SOL. The scripts write to `.env.local`.

## Stack

Next.js · TypeScript · `@solana/web3.js` · `@solana/spl-token` · `@pythnetwork/client` · Solana devnet · Vercel

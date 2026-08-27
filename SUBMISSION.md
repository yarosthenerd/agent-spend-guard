# Submission

## One-line pitch
Every agent control on Solana asks how much. None of them ask what you got back.

## Alternates
- Spending caps check the amount. Mandates check the fill.
- Your agent didn't exceed its limit. It still took a 40% worse price.

## Short description (~60 words)
Every AI-agent spending control on Solana is denominated in transfer amounts. None of them value what the vault
receives, so an agent can lose money without exceeding a single limit. Mandate compiles what an agent may do,
simulates each transaction against devnet, values the result against a live Pyth feed, and co-signs only if the
outcome holds up — enforced by a 2-of-2 SPL Token multisig.

## Full description

**The problem.** Agent wallet security stopped being theoretical in 2026: AI agent protocol exploits produced
$45M+ in losses through H1. Those losses were not ceiling breaches. In May an attacker sent an NFT to a
Grok-linked wallet; holding it granted "Executive" permissions and *bypassed* the transfer limits, and a
Morse-encoded instruction was decoded and executed for ~$175,000 with no human in the loop. The limits were
never exceeded. Every transaction was authorized. It just wasn't what the owner meant. No spending cap sees
that, because a cap checks amount and the failure was intent.

**The gap.** Solana's amount-checking layer is solved and free: the Foundation's Subscriptions & Allowances
program (audited by Cantina/Spearbit, mainnet, June 2 2026), Squads v5 hooks, Swig's on-chain policy engine,
Turnkey and Ledger's Agent Stack. Between them they cover *who* may act, *where*, and *how much*. **None of
them value what the vault receives.** We are deliberately narrow here: Squads hooks ship program whitelists and
Swig's roles cover specific assets, so either can block an unknown mint. The defensible claim is only that none
of them check the execution price against a reference. They will not close that gap either — the Foundation's
program is built for recurring billing and payroll, Squads is institutional treasury, Swig is roles and
permissions. Oracle-referenced slippage bounds and drawdown circuit breakers are not payments features.

**What we built.** The owner declares what the agent may *do* in a constrained grammar: allowed programs,
required oracle pricing, max slippage, per-trade size, position concentration, drawdown halt. Mandate compiles
it, simulates the agent's transaction unsigned against live devnet RPC (`sigVerify: false`,
`replaceRecentBlockhash: true`, with the `accounts` parameter listing the vault's token accounts), decodes the
true post-state balances from `AccountLayout`, values the deltas against a Pyth feed read on-chain, and
evaluates every constraint against the outcome the simulation actually produces.

**The verifier cannot be skipped by the thing it verifies.** The obvious objection to a pre-flight verifier is
that the agent can just not call it. So the vault's delegate is a **2-of-2 SPL Token multisig — agent plus
policy service — not the agent's pubkey.** `approve` accepts a multisig account as delegate, and the token
program then requires both signatures on every transfer. Verified on devnet in both directions: agent plus
policy co-signing settles; the agent using its own key as authority is rejected on-chain with
`custom program error: 0x4`. The demo exposes this as a button.

**Three rules, three demos.** Each is a distinct constraint, so "mandate" reads as a category rather than one
hardcoded check. (1) Buy SOLX at the reference price — within 0.4% of the live feed, every constraint passes,
it settles. (2) Buy SOLX 40% below reference — a real mint, a real feed, a real implied execution price;
`max slippage 2%` fires. (3) Swap the allowance into an unpriceable mint — no approved oracle publishes a
price, so the position cannot be valued at all and `require oracle pricing` fires. That third rule is
deliberately *not* a mint allowlist, which is the commoditized version of the same idea. In both blocked cases
the amount constraint (`max trade 500 gUSD`) passes. Amount checking is not the contribution.

**The mandate counter-offers, not just refuses.** When the only thing wrong is the price, the policy service
states the worst fill it will accept and co-signs *that* transaction instead — the agent asked for 2.15 SOLX
for 500 gUSD, the mandate permits no worse than 3.50 SOLX, and the agent never obtains a signature for its own
version. This is structurally identical to binding `minOutAmount` before signing, and it maps to minOut on a
real AMM.

**The kill switch proves itself.** The owner can revoke the delegate in one instruction, enforced by the token
program, so it holds even if our service is fully compromised. After revoking we immediately attempt a *fully
co-signed* transfer and report the on-chain rejection, so it is demonstrated rather than asserted.

**Every verdict is recorded, allows included** — mandate hash, simulated deltas, which rule fired, verdict,
timestamp. A checkable track record of constrained execution is the only asset in this category that compounds,
and it is what the Agent Registry's Validation Registry exists to anchor.

**What we're honest about.** Constraint *evaluation* is still off-chain; what is on-chain is the requirement
that the policy service sign at all, and a compromised policy key is the remaining trust assumption. Moving
evaluation itself into an audited program is the next layer and the actual product. The repair path constrains
the cooperative path, not every path — it works because our policy service also holds the venue key in this
demo, where on a real AMM the equivalent is writing `minOutAmount` into the instruction; "we constrain
execution" is accurate, "the agent cannot transact without us" would not be, and we do not claim it. SOLX is
our own devnet mint with no feed of its own, priced off the live Pyth **SOL/USD** feed as a stand-in — the
oracle read, the price and the slippage arithmetic are real, and that mapping is the demo's one substitution.
The grammar is deterministic by design, not because we lacked a model: a mandate is a security artifact that
must be reviewable, diffable and hashable, so natural language belongs above it as authoring sugar. Keys are
server-held so judges can click through without a wallet. What other products check is described from public
documentation, not live integrations. We deliberately do not compete on the allowance primitive. All of this is
in the README rather than implied away.

**Judging note.** It is one shared devnet vault, so there is a **Reset demo** button that re-mints the vault and
re-grants the allowance if a previous visitor left it in an odd state, and RPC failures surface as a banner
rather than a dead page.

## Links
- Live demo: https://agent-spend-guard-yaros3920-9222s-projects.vercel.app
- Repo: https://github.com/yarosthenerd/agent-spend-guard

## Tech
Next.js · TypeScript · `@solana/web3.js` · `@solana/spl-token` · `@pythnetwork/client` ·
`simulateTransaction` with account inspection · 2-of-2 SPL Token multisig · Solana devnet · Vercel

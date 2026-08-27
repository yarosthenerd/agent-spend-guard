# Submission

## One-line pitch
Every agent control on Solana asks how much. None of them ask what you got back.

## Alternates
- Spending caps check the amount. Mandates check the fill.
- Your agent didn't exceed its limit. It still lost 40% of the trade.

## Short description (~60 words)
Every AI-agent spending control on Solana is denominated in transfer amounts. An agent can lose a whole vault
without exceeding one: swap into a worthless mint, eat 40% slippage, over-concentrate. Mandate compiles what an
agent is allowed to do, simulates each transaction against devnet before signing, and blocks on the outcome the
simulation actually produces.

## Full description
**The problem.** Agent wallet security stopped being theoretical in 2026: AI agent protocol exploits produced
$45M+ in losses through H1. But those losses were not ceiling breaches. In the Bankr/Grok incident the transfer
limits were bypassed by permission escalation, not exceeded — every transaction was authorized, it just wasn't
what the owner meant. No spending cap solves that, because a cap checks amount and the failure was intent.

**The gap.** Solana already has excellent amount-denominated controls: the Foundation's audited Subscriptions &
Allowances program (mainnet, June 2026), Squads v5 spending limits, Swig policy roles. All of them ask *how
much*. None of them ask *in exchange for what*. An agent can lose 100% of a vault while staying inside every
limit — swap into a worthless mint, eat 40% slippage, over-concentrate into one position, LP into a rug. Those
products will never close this gap: the Foundation's program is built for recurring billing and payroll, Squads
is institutional treasury, Swig is roles and permissions. Venue allowlists, oracle-referenced slippage bounds
and drawdown circuit breakers are not payments features.

**What we built.** Mandate is a pre-flight enforcement layer. The owner declares what the agent may *do* in a
constrained grammar — allowed programs, allowed mints, max slippage, position concentration, drawdown halt. We
compile it, run `simulateTransaction` against live devnet RPC, decode the true post-state token balances from
the returned accounts, derive the real value deltas, and evaluate every constraint against the outcome the
simulation produces. The agent's transaction is signed only if the simulated outcome satisfies the mandate.

**The demo is the argument.** The agent proposes swapping its *entire 500 gUSD allowance* into a worthless mint
at a 40% loss. It exceeds nothing. Foundation Allowances allows it. Squads allows it. Swig allows it. Our own
previous version's delegate ceiling allows it. Mandate's own amount constraint allows it too — deliberately.
The block comes from `allow mints` and `max slippage`, evaluated against the simulation. An override button
lets you sign it anyway and watch the value actually leave the vault on devnet, with an explorer link, so the
block is demonstrably not theater.

**Why this maps onto how agents actually lose money.** In May 2026 an attacker sent an NFT to a Grok-linked
wallet; holding it granted "Executive" permissions and *bypassed* the transfer limits, and a Morse-encoded
instruction was decoded and executed for ~$175,000 with no human in the loop. The limits were never exceeded.
Every transaction was authorized. The failure was intent, not amount — and no spending cap can see that,
because a cap checks how much. An outcome check can: the destination and the resulting position are decoded
from the simulation and tested against the mandate regardless of what the agent believes it was told to do.
That is the same class of failure as a 40% fill or an unpriceable position, which is why all three are one
rule set rather than three products.

**What we're honest about.** Enforcement here is pre-flight, not on-chain: it stops a misbehaving agent, not a
compromised one. Moving these constraints into an audited program that custodies the capital is the next layer
and the actual product — advisory first, on-chain once the constraint set proves itself. We deliberately do not
compete on the allowance primitive; the Foundation shipped that audited and free, and we assume it underneath.
SOLX is our own devnet mint priced off the live Pyth SOL/USD feed as a stand-in, stated plainly in the UI and
README; what other products check is described from public docs, not live integrations. The repair path
constrains the cooperative path, not every path, and we say so rather than claiming the agent cannot transact
without us. All of this is stated in the README rather than implied away.

## Links
- Live demo: https://agent-spend-guard-yaros3920-9222s-projects.vercel.app
- Repo: https://github.com/yarosthenerd/agent-spend-guard

## Tech
Next.js · TypeScript · @solana/web3.js · @solana/spl-token · `simulateTransaction` with account inspection ·
Solana devnet · Vercel

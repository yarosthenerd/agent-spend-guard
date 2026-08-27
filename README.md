# Agent Spend-Guard

**Give your trading agent an allowance, not your wallet.**

Live demo: _see below_ · Solana **devnet** · every button sends a real transaction.

---

## The problem

Autonomous trading agents are shipping fast, and almost all of them are handed a raw private key.
The agent has full custody. If the model hallucinates, the prompt gets injected, or the signer
service is breached, the entire wallet is gone. The only "limit" is whatever the agent's own
codebase promises to respect — an off-chain promise, enforced by nobody.

## The idea

Solana already has the primitive for this and nearly nobody uses it for agents.

SPL Token's `approve` installs a **delegate with a hard-capped amount**, enforced by the token
program itself. `revoke` removes it in one instruction. So an agent can be given spending power
over a vault it does not own, bounded by a ceiling it cannot argue with.

Spend-Guard wraps that into an agent wallet with two independent layers:

| Layer | Enforces | Enforced by | Survives a compromised backend |
|---|---|---|---|
| **Policy** | per-trade cap, rolling daily cap, destination allowlist | this service | no |
| **Chain** | total allowance ceiling, instant revoke | SPL Token program | **yes** |

The policy layer is convenience. The chain layer is the guarantee. The demo proves the difference
by switching the policy layer off and watching Solana refuse the transaction anyway.

## What the demo does

1. **Grant allowance** — owner signs an on-chain `approveChecked`. Agent may now spend up to N gUSD.
2. **Normal trade** — agent signs its own `transferChecked` as delegate. Settles on devnet.
3. **Oversized trade** — blocked by the policy layer before it ever reaches the chain.
4. **Unlisted destination** — blocked by the allowlist.
5. **Drain attempt** — *policy layer deliberately bypassed*, simulating a fully compromised signer.
   SPL Token rejects it: `custom program error: 0x1`, allowance exhausted.
6. **Kill switch** — owner signs `revoke`. The agent's next trade fails on-chain with `0x4`.

Every result links to Solana Explorer. Nothing is mocked.

## Audit trail

Each spend carries a Memo instruction in the same atomic transaction:

```
spend-guard:trade:<amount>:policy=<sha256(policy)[0:16]>
```

The policy in force at the moment of the spend is committed on-chain alongside the transfer,
so it cannot be retroactively disowned.

## Design notes, honestly

- **No custom program.** Enforcement rides on SPL Token, which is already audited and battle-tested.
  That is the point: the guarantee exists today and is not being used.
- **Keys are server-held** so a judge can click through without installing a wallet. In production
  the owner key lives in the user's wallet and the agent key in the agent's runtime; nothing about
  the design requires them to share a host.
- **Policy state is client-held** in this build to keep the demo stateless on serverless. Its hash is
  committed on-chain per spend. In production the policy lives in the signer service.
- **Per-trade caps are off-chain.** Making those on-chain needs a program. The ceiling and the kill
  switch do not, which is why they work here.

## Run it

```bash
npm install --ignore-scripts
node scripts/setup.mjs   # creates the gUSD mint, vault, funds the agent for fees
npm run dev
```

`scripts/setup.mjs` expects `keys/devnet-keys.json` with base58 secrets for OWNER / AGENT / VENUE,
and the owner funded with devnet SOL. It writes `.env.local`.

## Stack

Next.js 15 · TypeScript · `@solana/web3.js` · `@solana/spl-token` · Solana devnet · Vercel

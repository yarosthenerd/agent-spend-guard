import { PublicKey, Transaction } from "@solana/web3.js";
import { AccountLayout, createTransferCheckedInstruction, getAssociatedTokenAddress } from "@solana/spl-token";
import { DECIMALS, agent, connection, memoIx, mint, owner, venueKp } from "./solana";
import type { Outcome } from "./mandate";

export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const MEMO_PROGRAM = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
const LABEL: Record<string, string> = { [TOKEN_PROGRAM]: "spl-token", [MEMO_PROGRAM]: "memo" };

/**
 * Reference prices. For the demo mints these are quoted constants; the same field is
 * populated from Pyth Hermes for real mints. Stubbed values are marked as such in the UI.
 */
export function assets() {
  return [
    { symbol: "gUSD", mint: process.env.MINT!, price: 1.0 },
    { symbol: "SOLX", mint: process.env.SOLX_MINT!, price: 2.0 },
    { symbol: "SCAM", mint: process.env.SCAM_MINT!, price: 0.02 },
  ];
}

export type Swap = { spend: number; receiveSymbol: string; receiveAmount: number };

/** Builds the trade as an atomic two-leg swap: vault pays gUSD, venue delivers the asset. */
export async function buildSwap(s: Swap) {
  const a = agent(), v = venueKp(), o = owner();
  const cash = mint();
  const asset = new PublicKey(assets().find((x) => x.symbol === s.receiveSymbol)!.mint);

  const vaultCash = await getAssociatedTokenAddress(cash, o.publicKey);
  const venueCash = await getAssociatedTokenAddress(cash, v.publicKey);
  const vaultAsset = await getAssociatedTokenAddress(asset, o.publicKey);
  const venueAsset = await getAssociatedTokenAddress(asset, v.publicKey);
  const base = (n: number) => BigInt(Math.round(n * 10 ** DECIMALS));

  const tx = new Transaction().add(
    memoIx(`mandate:swap:${s.spend}gUSD->${s.receiveAmount}${s.receiveSymbol}`, a.publicKey),
    // agent spends from the vault as delegate
    createTransferCheckedInstruction(vaultCash, cash, venueCash, a.publicKey, base(s.spend), DECIMALS),
    // venue delivers the other leg
    createTransferCheckedInstruction(venueAsset, asset, vaultAsset, v.publicKey, base(s.receiveAmount), DECIMALS),
  );
  return { tx, signers: [a, v], watch: [vaultCash, vaultAsset], vaultCash, vaultAsset };
}

/**
 * Simulate against devnet and read the *actual* post-state, so the mandate is checked
 * against what the transaction would really do rather than what it claims to do.
 */
export async function simulate(s: Swap): Promise<Outcome> {
  const c = connection();
  const { tx, watch } = await buildSwap(s);
  tx.feePayer = agent().publicKey;
  tx.recentBlockhash = (await c.getLatestBlockhash("confirmed")).blockhash;

  const o = owner();
  const list = assets();
  const vaultAtas = await Promise.all(list.map((x) => getAssociatedTokenAddress(new PublicKey(x.mint), o.publicKey)));

  const before = await Promise.all(vaultAtas.map(async (a) => {
    const info = await c.getAccountInfo(a);
    return info ? Number(AccountLayout.decode(info.data).amount) / 10 ** DECIMALS : 0;
  }));

  const sim = await c.simulateTransaction(tx, undefined, vaultAtas);
  if (sim.value.err && !sim.value.accounts) throw new Error(JSON.stringify(sim.value.err));

  const after = (sim.value.accounts ?? []).map((acc, i) => {
    if (!acc) return before[i];
    const data = Buffer.from(acc.data[0], acc.data[1] as BufferEncoding);
    return Number(AccountLayout.decode(data).amount) / 10 ** DECIMALS;
  });

  const legs = list.map((x, i) => {
    const delta = (after[i] ?? before[i]) - before[i];
    return { symbol: x.symbol, mint: x.mint, delta, price: x.price, value: Math.abs(delta) * x.price };
  });

  const valueOut = legs.filter((l) => l.delta < 0).reduce((s, l) => s + l.value, 0);
  const valueIn = legs.filter((l) => l.delta > 0).reduce((s, l) => s + l.value, 0);
  const vaultValueBefore = list.reduce((s, x, i) => s + before[i] * x.price, 0);
  const vaultValueAfter = list.reduce((s, x, i) => s + (after[i] ?? before[i]) * x.price, 0);

  return {
    programIds: [...new Set(tx.instructions.map((i) => LABEL[i.programId.toBase58()] ?? i.programId.toBase58()))],
    legs,
    valueOut,
    valueIn,
    slippagePct: valueOut > 0 ? Math.max(0, ((valueOut - valueIn) / valueOut) * 100) : 0,
    vaultValueBefore,
    vaultValueAfter,
    positions: list.map((x, i) => ({
      symbol: x.symbol,
      pct: vaultValueAfter > 0 ? ((after[i] ?? before[i]) * x.price / vaultValueAfter) * 100 : 0,
    })).filter((p) => p.symbol !== "gUSD"),
    drawdownPct: vaultValueBefore > 0 ? Math.max(0, ((vaultValueBefore - vaultValueAfter) / vaultValueBefore) * 100) : 0,
  };
}

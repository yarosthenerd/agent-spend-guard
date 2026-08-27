import { PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { AccountLayout, createTransferCheckedInstruction, getAssociatedTokenAddress } from "@solana/spl-token";
import { DECIMALS, agent, connection, memoIx, mint, multisigDelegate, owner, policyKp, venueKp } from "./solana";
import { prices } from "./oracle";
import type { Outcome } from "./mandate";

export class SimulationError extends Error {}

export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const MEMO_PROGRAM = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
const LABEL: Record<string, string> = { [TOKEN_PROGRAM]: "spl-token", [MEMO_PROGRAM]: "memo" };

export const MINTS = () => [
  { symbol: "gUSD", mint: process.env.MINT! },
  { symbol: "SOLX", mint: process.env.SOLX_MINT! },
  { symbol: "SCAM", mint: process.env.SCAM_MINT! },
];

export type Swap = { spend: number; receiveSymbol: string; receiveAmount: number };

/**
 * The trade is an atomic two-leg swap. The vault leg is authorised by the 2-of-2
 * multisig delegate, so the SPL Token program itself rejects any version of this
 * transaction that the policy service has not co-signed.
 */
export async function buildSwap(s: Swap) {
  const a = agent(), v = venueKp(), o = owner(), p = policyKp();
  const cash = mint();
  const asset = new PublicKey(MINTS().find((x) => x.symbol === s.receiveSymbol)!.mint);

  const vaultCash = await getAssociatedTokenAddress(cash, o.publicKey);
  const venueCash = await getAssociatedTokenAddress(cash, v.publicKey);
  const vaultAsset = await getAssociatedTokenAddress(asset, o.publicKey);
  const venueAsset = await getAssociatedTokenAddress(asset, v.publicKey);
  const base = (n: number) => BigInt(Math.round(n * 10 ** DECIMALS));

  const ixs: TransactionInstruction[] = [
    memoIx(`mandate:swap:${s.spend}gUSD->${s.receiveAmount}${s.receiveSymbol}`, a.publicKey),
    createTransferCheckedInstruction(
      vaultCash, cash, venueCash, multisigDelegate(), base(s.spend), DECIMALS,
      [a.publicKey, p.publicKey], // 2-of-2: agent proposes, policy service co-signs
    ),
    createTransferCheckedInstruction(venueAsset, asset, vaultAsset, v.publicKey, base(s.receiveAmount), DECIMALS),
  ];
  return { ixs, coSigners: [a, p, v] };
}

/** The same transaction, but authorised by the agent key alone. Used to demonstrate what
 *  happens when the agent skips the policy service entirely. */
export async function buildSoloSwap(s: Swap) {
  const a = agent(), v = venueKp(), o = owner();
  const cash = mint();
  const asset = new PublicKey(MINTS().find((x) => x.symbol === s.receiveSymbol)!.mint);
  const base = (n: number) => BigInt(Math.round(n * 10 ** DECIMALS));
  return {
    ixs: [
      memoIx(`mandate:solo-attempt:${s.spend}gUSD`, a.publicKey),
      createTransferCheckedInstruction(
        await getAssociatedTokenAddress(cash, o.publicKey), cash,
        await getAssociatedTokenAddress(cash, v.publicKey),
        a.publicKey, base(s.spend), DECIMALS,
      ),
    ],
    coSigners: [a],
  };
}

export async function simulate(s: Swap): Promise<Outcome> {
  const c = connection();
  const { ixs } = await buildSwap(s);
  const o = owner();
  const list = MINTS();
  const px = await prices(list.map((x) => x.symbol));
  const vaultAtas = await Promise.all(list.map((x) => getAssociatedTokenAddress(new PublicKey(x.mint), o.publicKey)));

  const before = await Promise.all(vaultAtas.map(async (a) => {
    const info = await c.getAccountInfo(a);
    return info ? Number(AccountLayout.decode(info.data).amount) / 10 ** DECIMALS : 0;
  }));

  // Unsigned simulation: signature checks off, blockhash replaced by the node.
  const msg = new TransactionMessage({
    payerKey: agent().publicKey,
    recentBlockhash: (await c.getLatestBlockhash("confirmed")).blockhash,
    instructions: ixs,
  }).compileToV0Message();

  const sim = await c.simulateTransaction(new VersionedTransaction(msg), {
    sigVerify: false,
    replaceRecentBlockhash: true,
    accounts: { encoding: "base64", addresses: vaultAtas.map((a) => a.toBase58()) },
  });

  if (sim.value.err && !sim.value.accounts?.length) {
    const logs = (sim.value.logs ?? []).join(" ");
    const code = logs.match(/custom program error: (0x[0-9a-f]+)/)?.[1] ?? JSON.stringify(sim.value.err);
    throw new SimulationError(
      code === "0x1"
        ? "The vault's delegated allowance is too small to even simulate this trade."
        : `Simulation failed (${code}).`,
    );
  }

  const after = (sim.value.accounts ?? []).map((acc, i) => {
    if (!acc) return before[i];
    const data = Buffer.from(acc.data[0], acc.data[1] as BufferEncoding);
    return Number(AccountLayout.decode(data).amount) / 10 ** DECIMALS;
  });

  const legs = list.map((x, i) => {
    const delta = (after[i] ?? before[i]) - before[i];
    const p = px[x.symbol];
    const price = p.priceable ? p.price : 0;
    return {
      symbol: x.symbol, mint: x.mint, delta, price,
      value: Math.abs(delta) * price,
      priceable: p.priceable,
      source: p.priceable ? p.source : p.reason,
    };
  });

  const val = (i: number, amt: number) => (px[list[i].symbol].priceable ? amt * (px[list[i].symbol] as any).price : 0);
  const valueOut = legs.filter((l) => l.delta < 0).reduce((s, l) => s + l.value, 0);
  const valueIn = legs.filter((l) => l.delta > 0).reduce((s, l) => s + l.value, 0);
  const vaultValueBefore = list.reduce((s, _x, i) => s + val(i, before[i]), 0);
  const vaultValueAfter = list.reduce((s, _x, i) => s + val(i, after[i] ?? before[i]), 0);

  return {
    programIds: [...new Set(ixs.map((i) => LABEL[i.programId.toBase58()] ?? i.programId.toBase58()))],
    legs,
    valueOut, valueIn,
    slippagePct: valueOut > 0 ? Math.max(0, ((valueOut - valueIn) / valueOut) * 100) : 0,
    vaultValueBefore, vaultValueAfter,
    positions: list.map((x, i) => ({
      symbol: x.symbol,
      pct: vaultValueAfter > 0 ? (val(i, after[i] ?? before[i]) / vaultValueAfter) * 100 : 0,
    })).filter((p) => p.symbol !== "gUSD"),
    drawdownPct: vaultValueBefore > 0 ? Math.max(0, ((vaultValueBefore - vaultValueAfter) / vaultValueBefore) * 100) : 0,
  };
}

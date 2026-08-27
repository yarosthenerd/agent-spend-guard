import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddress } from "@solana/spl-token";
import bs58 from "bs58";

export const RPC_URL = process.env.RPC_URL ?? "https://api.devnet.solana.com";
export const DECIMALS = 6;
export const SYMBOL = "gUSD";

export const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

export const connection = () => new Connection(RPC_URL, "confirmed");

function kp(envName: string): Keypair {
  const raw = process.env[envName];
  if (!raw) throw new Error(`missing env ${envName}`);
  return Keypair.fromSecretKey(bs58.decode(raw));
}

export const owner = () => kp("OWNER_SECRET");
export const agent = () => kp("AGENT_SECRET");
export const venue = () => new PublicKey(process.env.VENUE_PUBKEY!);
export const venueKp = () => kp("VENUE_SECRET");
/** The policy service co-signer. Half of the 2-of-2 SPL Token multisig delegate. */
export const policyKp = () => kp("POLICY_SECRET");
export const multisigDelegate = () => new PublicKey(process.env.MULTISIG_DELEGATE!);
export const mint = () => new PublicKey(process.env.MINT!);

export const toBase = (ui: number) => BigInt(Math.round(ui * 10 ** DECIMALS));
export const toUi = (base: bigint | number) => Number(base) / 10 ** DECIMALS;

export function memoIx(text: string, signer: PublicKey): TransactionInstruction {
  return new TransactionInstruction({
    keys: [{ pubkey: signer, isSigner: true, isWritable: false }],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(text, "utf8"),
  });
}

/** The public devnet RPC rate-limits aggressively; a judge clicking through should not see that. */
export async function retry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  let last: any;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e: any) {
      last = e;
      if (!/429|Too Many Requests|blockhash/i.test(String(e.message))) throw e;
      await new Promise((r) => setTimeout(r, 400 * 2 ** i));
    }
  }
  throw last;
}

export async function send(ixs: TransactionInstruction[], signers: Keypair[]) {
  const c = connection();
  const tx = new Transaction().add(...ixs);
  const bh = await retry(() => c.getLatestBlockhash("confirmed"));
  tx.recentBlockhash = bh.blockhash;
  tx.feePayer = signers[0].publicKey;
  tx.sign(...signers);
  const sig = await retry(() => c.sendRawTransaction(tx.serialize(), { skipPreflight: false }));
  await c.confirmTransaction({ signature: sig, ...bh }, "confirmed");
  return sig;
}

/** Live on-chain view of the vault: balance, who the delegate is, how much it may still spend. */
export async function vaultState() {
  const c = connection();
  const m = mint();
  const ownerAta = await getAssociatedTokenAddress(m, owner().publicKey);
  const venueAta = await getAssociatedTokenAddress(m, venue());
  const acct = await getAccount(c, ownerAta);
  let venueBal = 0n;
  try { venueBal = (await getAccount(c, venueAta)).amount; } catch { /* not yet created */ }

  return {
    mint: m.toBase58(),
    symbol: SYMBOL,
    ownerPubkey: owner().publicKey.toBase58(),
    agentPubkey: agent().publicKey.toBase58(),
    venuePubkey: venue().toBase58(),
    vaultAta: ownerAta.toBase58(),
    vaultBalance: toUi(acct.amount),
    venueBalance: toUi(venueBal),
    delegate: acct.delegate ? acct.delegate.toBase58() : null,
    multisigDelegate: process.env.MULTISIG_DELEGATE ?? null,
    policyPubkey: policyKp().publicKey.toBase58(),
    delegateIsMultisig: acct.delegate?.toBase58() === process.env.MULTISIG_DELEGATE,
    // The hard on-chain ceiling. SPL Token itself refuses any delegated spend above this.
    allowanceRemaining: acct.delegate ? toUi(acct.delegatedAmount) : 0,
    agentIsDelegate: acct.delegate?.equals(agent().publicKey) ?? false,
  };
}

/**
 * Demo affordance: the vault's allowance is topped back up when it runs low, so the
 * hosted demo keeps working however many times it is clicked. Not a production behaviour.
 */
export async function ensureAllowance(min = 1000, target = 5000) {
  const { getAssociatedTokenAddress, createApproveCheckedInstruction } = await import("@solana/spl-token");
  const st = await vaultState();
  if (st.delegateIsMultisig && st.allowanceRemaining >= min) return null;
  const o = owner();
  const ata = await getAssociatedTokenAddress(mint(), o.publicKey);
  return send([
    memoIx(`mandate:top-up:${target}`, o.publicKey),
    createApproveCheckedInstruction(ata, mint(), multisigDelegate(), o.publicKey, toBase(target), DECIMALS),
  ], [o]);
}

export const explorer = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
export const explorerAddr = (a: string) => `https://explorer.solana.com/address/${a}?cluster=devnet`;

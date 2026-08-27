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

export async function send(ixs: TransactionInstruction[], signers: Keypair[]) {
  const c = connection();
  const tx = new Transaction().add(...ixs);
  const bh = await c.getLatestBlockhash("confirmed");
  tx.recentBlockhash = bh.blockhash;
  tx.feePayer = signers[0].publicKey;
  tx.sign(...signers);
  const sig = await c.sendRawTransaction(tx.serialize(), { skipPreflight: false });
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
    // The hard on-chain ceiling. SPL Token itself refuses any delegated spend above this.
    allowanceRemaining: acct.delegate ? toUi(acct.delegatedAmount) : 0,
    agentIsDelegate: acct.delegate?.equals(agent().publicKey) ?? false,
  };
}

export const explorer = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
export const explorerAddr = (a: string) => `https://explorer.solana.com/address/${a}?cluster=devnet`;

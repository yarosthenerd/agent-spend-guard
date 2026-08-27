// Stronger proof: the agent uses its OWN key as authority. The delegate is the
// multisig, so the token program must reject it on-chain, not the local signer.
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { createTransferCheckedInstruction, getAssociatedTokenAddress } from "@solana/spl-token";
import bs58 from "bs58"; import fs from "fs";
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n").filter(Boolean).map(l=>[l.slice(0,l.indexOf("=")),l.slice(l.indexOf("=")+1)]));
const K = JSON.parse(fs.readFileSync("keys/devnet-keys.json","utf8"));
const kp = r => Keypair.fromSecretKey(bs58.decode(K[r].sk));
const owner=kp("OWNER"), agent=kp("AGENT"), venue=kp("VENUE");
const c = new Connection("https://api.devnet.solana.com","confirmed");
const MINT = new PublicKey(env.MINT);
const vault = await getAssociatedTokenAddress(MINT, owner.publicKey);
const venueAta = await getAssociatedTokenAddress(MINT, venue.publicKey);
try {
  await sendAndConfirmTransaction(c, new Transaction().add(
    createTransferCheckedInstruction(vault, MINT, venueAta, agent.publicKey, 1_000_000n, 6)), [agent]);
  console.log("agent solo as authority: SUCCEEDED  <-- BAD");
} catch(e){
  const m = String(e.message);
  console.log("agent solo as authority: REJECTED ON-CHAIN ->", (m.match(/custom program error: 0x[0-9a-f]+/)||[m.split("\n")[0]])[0]);
}

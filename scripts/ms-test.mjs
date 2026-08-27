// Can an SPL Token *multisig* be the delegate, so the token program itself refuses
// any transfer lacking the policy signature? If yes, enforcement leaves our service.
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { createMultisig, createApproveCheckedInstruction, createTransferCheckedInstruction, getAssociatedTokenAddress } from "@solana/spl-token";
import bs58 from "bs58"; import fs from "fs";

const K = JSON.parse(fs.readFileSync("keys/devnet-keys.json","utf8"));
const kp = r => Keypair.fromSecretKey(bs58.decode(K[r].sk));
const owner=kp("OWNER"), agent=kp("AGENT"), venue=kp("VENUE");
const policy = Keypair.generate();
const c = new Connection("https://api.devnet.solana.com","confirmed");
const MINT = new PublicKey(process.env.MINT ?? fs.readFileSync(".env.local","utf8").match(/^MINT=(.+)$/m)[1]);

console.log("policy pubkey:", policy.publicKey.toBase58());
const ms = await createMultisig(c, owner, [agent.publicKey, policy.publicKey], 2);
console.log("multisig delegate:", ms.toBase58());

const vault = await getAssociatedTokenAddress(MINT, owner.publicKey);
const venueAta = await getAssociatedTokenAddress(MINT, venue.publicKey);

// owner approves the MULTISIG as delegate
await sendAndConfirmTransaction(c, new Transaction().add(
  createApproveCheckedInstruction(vault, MINT, ms, owner.publicKey, 500_000_000n, 6)), [owner]);
console.log("approved multisig as delegate for 500");

const xfer = (amt) => new Transaction().add(
  createTransferCheckedInstruction(vault, MINT, venueAta, ms, amt, 6, [agent.publicKey, policy.publicKey]));

// A) agent alone — must FAIL
try { await sendAndConfirmTransaction(c, xfer(1_000_000n), [agent]); console.log("A) agent alone: SUCCEEDED  <-- BAD"); }
catch(e){ console.log("A) agent alone: REJECTED ->", String(e.message).split("\n")[0].slice(0,80)); }

// B) agent + policy — must SUCCEED
try { const s = await sendAndConfirmTransaction(c, xfer(1_000_000n), [agent, policy]); console.log("B) agent+policy: SETTLED", s.slice(0,20)+"…"); }
catch(e){ console.log("B) agent+policy: FAILED ->", String(e.message).split("\n")[0].slice(0,120)); }

fs.appendFileSync(".env.local", `POLICY_SECRET=${bs58.encode(policy.secretKey)}\nMULTISIG_DELEGATE=${ms.toBase58()}\n`);

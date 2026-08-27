// One-time devnet bootstrap: create the demo stablecoin, the vault, and fund the agent for fees.
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL, sendAndConfirmTransaction } from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import bs58 from "bs58";
import fs from "fs";

const K = JSON.parse(fs.readFileSync("keys/devnet-keys.json", "utf8"));
const kp = (r) => Keypair.fromSecretKey(bs58.decode(K[r].sk));
const owner = kp("OWNER"), agent = kp("AGENT"), venue = kp("VENUE");
const c = new Connection("https://api.devnet.solana.com", "confirmed");

const bal = await c.getBalance(owner.publicKey);
console.log("owner SOL:", bal / LAMPORTS_PER_SOL);
if (bal < 0.05 * LAMPORTS_PER_SOL) { console.error("owner underfunded"); process.exit(1); }

// The agent signs its own trades, so it needs lamports for fees (never token custody).
console.log("funding agent with fee SOL...");
await sendAndConfirmTransaction(c, new Transaction().add(
  SystemProgram.transfer({ fromPubkey: owner.publicKey, toPubkey: agent.publicKey, lamports: 0.05 * LAMPORTS_PER_SOL })
), [owner]);

console.log("creating gUSD mint...");
const mint = await createMint(c, owner, owner.publicKey, null, 6);
console.log("mint:", mint.toBase58());

const ownerAta = await getOrCreateAssociatedTokenAccount(c, owner, mint, owner.publicKey);
const venueAta = await getOrCreateAssociatedTokenAccount(c, owner, mint, venue.publicKey);
console.log("vault (owner ATA):", ownerAta.address.toBase58());
console.log("venue ATA:", venueAta.address.toBase58());

console.log("minting 10,000 gUSD into vault...");
await mintTo(c, owner, mint, ownerAta.address, owner, 10_000n * 1_000_000n);

const env = [
  `RPC_URL=https://api.devnet.solana.com`,
  `MINT=${mint.toBase58()}`,
  `OWNER_SECRET=${K.OWNER.sk}`,
  `AGENT_SECRET=${K.AGENT.sk}`,
  `VENUE_PUBKEY=${K.VENUE.pk}`,
].join("\n") + "\n";
fs.writeFileSync(".env.local", env);
console.log("\nwrote .env.local\n");
console.log(env.replace(/(SECRET=)(.{8}).*/g, "$1$2...[redacted]"));

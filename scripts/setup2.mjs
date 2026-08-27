// Adds the two assets the mandate demo trades into: one sane venue asset, one worthless mint.
import { Connection, Keypair, LAMPORTS_PER_SOL, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import bs58 from "bs58";
import fs from "fs";

const K = JSON.parse(fs.readFileSync("keys/devnet-keys.json", "utf8"));
const kp = (r) => Keypair.fromSecretKey(bs58.decode(K[r].sk));
const owner = kp("OWNER"), venue = kp("VENUE");
const c = new Connection("https://api.devnet.solana.com", "confirmed");

// The venue co-signs swaps (it sends the asset leg), so it needs fee lamports.
console.log("funding venue for fees...");
await sendAndConfirmTransaction(c, new Transaction().add(
  SystemProgram.transfer({ fromPubkey: owner.publicKey, toPubkey: venue.publicKey, lamports: 0.04 * LAMPORTS_PER_SOL })
), [owner]);

const out = {};
for (const [name, supply] of [["SOLX", 500_000n], ["SCAM", 50_000_000n]]) {
  const m = await createMint(c, owner, owner.publicKey, null, 6);
  // Venue holds inventory to sell; the vault needs a receiving account for each.
  const venueAta = await getOrCreateAssociatedTokenAccount(c, owner, m, venue.publicKey);
  const ownerAta = await getOrCreateAssociatedTokenAccount(c, owner, m, owner.publicKey);
  await mintTo(c, owner, m, venueAta.address, owner, supply * 1_000_000n);
  out[name] = m.toBase58();
  console.log(`${name} mint ${m.toBase58()}  vaultAta ${ownerAta.address.toBase58()}`);
}

let env = fs.readFileSync(".env.local", "utf8").split("\n").filter(l => !/^(SOLX_MINT|SCAM_MINT|VENUE_SECRET)=/.test(l)).join("\n").replace(/\n+$/, "\n");
env += `SOLX_MINT=${out.SOLX}\nSCAM_MINT=${out.SCAM}\nVENUE_SECRET=${K.VENUE.sk}\n`;
fs.writeFileSync(".env.local", env);
console.log("\n.env.local updated");

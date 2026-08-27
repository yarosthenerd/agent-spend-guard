import { Connection, PublicKey } from "@solana/web3.js";
import { parsePriceData } from "@pythnetwork/client";
const c = new Connection("https://api.devnet.solana.com","confirmed");
const feeds = { "SOL/USD":"J83w4HKfqxwcq3BEMMkPFSppX3gqekLyLJBexebFVkix", "BTC/USD":"HovQMDrbAgAYPCmHVSrezcSmkMtXSSUsLDFANExrZh2J" };
for (const [k,v] of Object.entries(feeds)) {
  try {
    const ai = await c.getAccountInfo(new PublicKey(v));
    if (!ai) { console.log(k, "NO ACCOUNT"); continue; }
    const p = parsePriceData(ai.data);
    console.log(k, "price:", p.price ?? p.previousPrice, "conf:", p.confidence, "status:", p.status, "slot:", String(p.lastSlot));
  } catch(e){ console.log(k, "ERR", String(e.message).slice(0,80)); }
}

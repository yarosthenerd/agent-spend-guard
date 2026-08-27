import { PublicKey } from "@solana/web3.js";
import { parsePriceData } from "@pythnetwork/client";
import { connection } from "./solana";

/** Pyth devnet price accounts, read on-chain rather than through a hosted API. */
const FEEDS: Record<string, { feed: string; pair: string }> = {
  SOLX: { feed: "J83w4HKfqxwcq3BEMMkPFSppX3gqekLyLJBexebFVkix", pair: "SOL/USD" },
};

export type Price =
  | { symbol: string; priceable: true; price: number; source: string; feed: string; slot: string }
  | { symbol: string; priceable: false; reason: string };

// Cached per symbol, not per call, so a narrow lookup cannot poison a wider one.
const cache = new Map<string, { at: number; price: Price }>();

export async function prices(symbols: string[]): Promise<Record<string, Price>> {
  const c = connection();
  const out: Record<string, Price> = {};

  for (const s of symbols) {
    const hit = cache.get(s);
    if (hit && Date.now() - hit.at < 20_000) { out[s] = hit.price; continue; }
    // The unit of account is quoted at par by definition, not by an oracle.
    if (s === "gUSD") { out[s] = { symbol: s, priceable: true, price: 1, source: "unit of account", feed: "—", slot: "—" }; continue; }
    const f = FEEDS[s];
    if (!f) { out[s] = { symbol: s, priceable: false, reason: "no approved oracle publishes a price for this mint" }; continue; }
    try {
      const info = await c.getAccountInfo(new PublicKey(f.feed));
      const p = info && parsePriceData(info.data);
      const px = p?.price ?? p?.previousPrice;
      if (!px) throw new Error("feed returned no price");
      out[s] = { symbol: s, priceable: true, price: px, source: `Pyth ${f.pair} (devnet)`, feed: f.feed, slot: String(p!.lastSlot) };
    } catch (e: any) {
      out[s] = { symbol: s, priceable: false, reason: `oracle read failed: ${e.message}` };
    }
  }
  for (const [k, v] of Object.entries(out)) cache.set(k, { at: Date.now(), price: v });
  return out;
}

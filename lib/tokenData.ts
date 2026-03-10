/**
 * lib/tokenData.ts
 * Fetches live market data from DexScreener API (free, no key needed).
 * Endpoint: https://api.dexscreener.com/tokens/v1/base/{addresses}
 * Supports up to 30 addresses per request.
 */

export interface TokenMarketData {
  priceUsd:  number | null;
  marketCap: number | null;
  fdv:       number | null;
  volume24h: number | null;
  liquidity: number | null;
  priceChange24h: number | null;
  txns24h:   number | null;
  imageUrl:  string | null;
  dexUrl:    string | null;
}

interface DexPair {
  chainId:     string;
  dexId:       string;
  url:         string;
  pairAddress: string;
  baseToken:   { address: string; name: string; symbol: string };
  priceUsd?:   string;
  volume?:     { h24?: number };
  priceChange?:{ h24?: number };
  liquidity?:  { usd?: number };
  fdv?:        number;
  marketCap?:  number;
  info?:       { imageUrl?: string };
  txns?:       { h24?: { buys?: number; sells?: number } };
}

export async function getTokensMarketData(
  addresses: string[]
): Promise<Map<string, TokenMarketData>> {
  const map = new Map<string, TokenMarketData>();
  if (!addresses.length) return map;

  // DexScreener supports up to 30 addresses per request
  const chunks: string[][] = [];
  for (let i = 0; i < addresses.length; i += 30) {
    chunks.push(addresses.slice(i, i + 30));
  }

  await Promise.allSettled(
    chunks.map(async (chunk) => {
      try {
        const url = `https://api.dexscreener.com/tokens/v1/base/${chunk.join(",")}`;
        const res = await fetch(url, {
          cache: "no-store",
          headers: { "Accept": "application/json" },
        });
        if (!res.ok) return;

        const pairs: DexPair[] = await res.json();
        if (!Array.isArray(pairs)) return;

        // Group by base token address, pick the pair with highest liquidity
        const byToken = new Map<string, DexPair>();
        for (const pair of pairs) {
          if (pair.chainId !== "base") continue;
          const addr = pair.baseToken.address.toLowerCase();
          const existing = byToken.get(addr);
          const liq = pair.liquidity?.usd ?? 0;
          const existingLiq = existing?.liquidity?.usd ?? 0;
          if (!existing || liq > existingLiq) {
            byToken.set(addr, pair);
          }
        }

        byToken.forEach((pair, addr) => {
          const buys  = pair.txns?.h24?.buys  ?? 0;
          const sells = pair.txns?.h24?.sells ?? 0;
          map.set(addr, {
            priceUsd:      pair.priceUsd ? parseFloat(pair.priceUsd) : null,
            marketCap:     pair.marketCap  ?? null,
            fdv:           pair.fdv        ?? null,
            volume24h:     pair.volume?.h24 ?? null,
            liquidity:     pair.liquidity?.usd ?? null,
            priceChange24h:pair.priceChange?.h24 ?? null,
            txns24h:       buys + sells || null,
            imageUrl:      pair.info?.imageUrl ?? null,
            dexUrl:        pair.url ?? null,
          });
        });

      } catch (e) {
        console.error("[tokenData] DexScreener error:", e);
      }
    })
  );

  return map;
}

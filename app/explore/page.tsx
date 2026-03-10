import Link from "next/link";
import Image from "next/image";
import ScanlinesOverlay from "@/app/components/ScanlinesOverlay";
import HUD from "@/app/components/HUD";
import PixelPanel from "@/app/components/PixelPanel";
import PixelButton from "@/app/components/PixelButton";
import { GithubIcon } from "@/app/components/Icons";
import { unstable_noStore as noStore } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";
import { getTokensMarketData } from "@/lib/tokenData";
import styles from "./explore.module.css";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

interface TokenRow {
  id: string;
  name: string;
  symbol: string;
  token_address: string | null;
  creator_payout: string;
  created_at: string;
  users: { username: string; avatar_url: string } | null;
}

async function getLiveTokens(): Promise<TokenRow[]> {
  noStore();
  const { data, error } = await supabaseAdmin
    .from("launch_requests")
    .select("id, name, symbol, token_address, creator_payout, created_at, users(username, avatar_url)")
    .eq("status", "done")
    .not("token_address", "is", null)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) { console.error("[explore] supabase error:", error); return []; }
  return (data ?? []).map((row) => ({
    ...row,
    users: Array.isArray(row.users) ? row.users[0] ?? null : row.users,
  })) as TokenRow[];
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function fmtPrice(n: number): string {
  if (n === 0) return "$0.00";
  if (n < 0.000001) return `$${n.toExponential(2)}`;
  if (n < 0.01)     return `$${n.toFixed(6)}`;
  if (n < 1)        return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function timeAgo(dateStr: string) {
  const diff  = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export default async function ExplorePage() {
  const tokens = await getLiveTokens();
  const addresses = tokens.map(t => t.token_address!).filter(Boolean);
  const marketMap = await getTokensMarketData(addresses);

  let totalVolume = 0;
  let totalMc     = 0;
  marketMap.forEach(t => {
    totalVolume += t.volume24h ?? 0;
    totalMc     += t.marketCap ?? t.fdv ?? 0;
  });

  return (
    <div className={styles.root}>
      <ScanlinesOverlay />
      <HUD />
      <main className={styles.main}>

        {/* HEADER */}
        <div className={styles.header}>
          <div>
            <span className={styles.tag}>// EXPLORE CITY</span>
            <h1 className={styles.title}>Tokens on GitLaunchr</h1>
            <p className={styles.sub}>Launched by GitHub builders · Live data via DexScreener</p>
          </div>
          <Link href="/launch/new">
            <PixelButton variant="primary" size="md">▶ LAUNCH YOURS</PixelButton>
          </Link>
        </div>

        {/* STATS BAR */}
        <div className={styles.statsBar}>
          <div className={styles.stat}>
            <span className={styles.statVal} style={{ color: "var(--success)" }}>{tokens.length}</span>
            <span className={styles.statLabel}>LIVE TOKENS</span>
          </div>
          <div className={styles.statDiv} />
          <div className={styles.stat}>
            <span className={styles.statVal} style={{ color: "var(--primary)" }}>
              {totalMc > 0 ? fmt(totalMc) : "—"}
            </span>
            <span className={styles.statLabel}>TOTAL MKT CAP</span>
          </div>
          <div className={styles.statDiv} />
          <div className={styles.stat}>
            <span className={styles.statVal} style={{ color: "var(--cyan)" }}>
              {totalVolume > 0 ? fmt(totalVolume) : "—"}
            </span>
            <span className={styles.statLabel}>VOL 24H</span>
          </div>
          <div className={styles.statDiv} />
          <div className={styles.stat}>
            <span className={styles.statVal} style={{ color: "var(--warning)" }}>BASE</span>
            <span className={styles.statLabel}>NETWORK</span>
          </div>
        </div>

        {/* TOKEN GRID */}
        {tokens.length === 0 ? (
          <PixelPanel variant="cyan" label="NO TOKENS YET">
            <div className={styles.empty}>
              <p>Be the first to launch a token on GitLaunchr.</p>
              <Link href="/launch/new">
                <PixelButton variant="primary" size="md">▶ LAUNCH NOW</PixelButton>
              </Link>
            </div>
          </PixelPanel>
        ) : (
          <div className={styles.grid}>
            {tokens.map((token) => {
              const username   = token.users?.username ?? "unknown";
              const avatarUrl  = token.users?.avatar_url ?? "";
              const market     = token.token_address
                ? marketMap.get(token.token_address.toLowerCase())
                : undefined;

              const price    = market?.priceUsd      ?? null;
              const mc       = market?.marketCap     ?? market?.fdv ?? null;
              const vol      = market?.volume24h     ?? null;
              const liq      = market?.liquidity     ?? null;
              const change   = market?.priceChange24h ?? null;
              const txns     = market?.txns24h       ?? null;
              const tokenImg = market?.imageUrl ?? avatarUrl;
              const tradeUrl = market?.dexUrl
                ?? (token.token_address ? `https://app.doppler.lol/tokens/base/${token.token_address}` : null);
              const basescanUrl = token.token_address
                ? `https://basescan.org/address/${token.token_address}`
                : null;
              const hasMarket = !!(price || mc);

              return (
                <div key={token.id} className={styles.card}>

                  {/* TOP */}
                  <div className={styles.cardTop}>
                    <div className={styles.cardLeft}>
                      {tokenImg && (
                        <Image src={tokenImg} alt={token.name} width={40} height={40}
                          className={styles.tokenImg} unoptimized />
                      )}
                      <div className={styles.cardName}>
                        <span className={styles.tokenName}>{token.name}</span>
                        <span className={styles.tokenSymbol}>${token.symbol}</span>
                      </div>
                    </div>
                    <div className={styles.cardRight}>
                      <span className={styles.cardTime}>{timeAgo(token.created_at)}</span>
                      {price && <span className={styles.price}>{fmtPrice(price)}</span>}
                      {change !== null && (
                        <span className={styles.change} style={{ color: change >= 0 ? "var(--success)" : "#ff4444" }}>
                          {change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </div>

                  {/* MARKET DATA */}
                  {hasMarket && (
                    <div className={styles.statsRow}>
                      <div className={styles.statCell}>
                        <span className={styles.statCellLabel}>MKT CAP</span>
                        <span className={styles.statCellVal} style={{ color: "var(--success)" }}>
                          {mc ? fmt(mc) : "—"}
                        </span>
                      </div>
                      <div className={styles.statCell}>
                        <span className={styles.statCellLabel}>VOL 24H</span>
                        <span className={styles.statCellVal} style={{ color: "var(--primary)" }}>
                          {vol ? fmt(vol) : "—"}
                        </span>
                      </div>
                      <div className={styles.statCell}>
                        <span className={styles.statCellLabel}>LIQ</span>
                        <span className={styles.statCellVal} style={{ color: "var(--cyan)" }}>
                          {liq ? fmt(liq) : "—"}
                        </span>
                      </div>
                      {txns !== null && (
                        <div className={styles.statCell}>
                          <span className={styles.statCellLabel}>TXNS</span>
                          <span className={styles.statCellVal} style={{ color: "var(--warning)" }}>
                            {txns}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* CREATOR */}
                  <div className={styles.creator}>
                    {avatarUrl && (
                      <Image src={avatarUrl} alt={username} width={18} height={18}
                        className={styles.avatar} unoptimized />
                    )}
                    <a href={`https://github.com/${username}`} target="_blank" rel="noreferrer"
                      className={styles.creatorLink}>
                      <GithubIcon size={11} color="var(--muted)" />
                      <span>@{username}</span>
                    </a>
                    {token.creator_payout?.startsWith("@") && (
                      <a href={`https://x.com/${token.creator_payout.replace("@", "")}`}
                        target="_blank" rel="noreferrer" className={styles.twitterHandle}>
                        {token.creator_payout}
                      </a>
                    )}
                  </div>

                  {/* CA */}
                  {token.token_address && (
                    <div className={styles.caRow}>
                      <span className={styles.caLabel}>CA</span>
                      <a href={basescanUrl!} target="_blank" rel="noreferrer"
                        className={styles.caAddr} title={token.token_address}>
                        {shortAddr(token.token_address)}
                      </a>
                    </div>
                  )}

                  {/* ACTIONS */}
                  <div className={styles.actions}>
                    {tradeUrl && (
                      <a href={tradeUrl} target="_blank" rel="noreferrer" className={styles.actionBtn}>
                        🔀 TRADE
                      </a>
                    )}
                    {basescanUrl && (
                      <a href={basescanUrl} target="_blank" rel="noreferrer" className={styles.actionBtnSecondary}>
                        ↗ BASESCAN
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

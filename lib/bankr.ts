/**
 * lib/bankr.ts
 * Uses the Bankr Partner Deploy API — explicit feeRecipient, no prompt parsing.
 * Docs: https://docs.bankr.bot/token-launching/partner-api
 *
 * Requires env var: BANKR_PARTNER_KEY  (X-Partner-Key header)
 * Contact Bankr team to get a partner key provisioned with a deployment wallet.
 */

const BANKR_API_BASE = "https://api.bankr.bot";

function getPartnerHeaders(): Record<string, string> {
  const key = process.env.BANKR_PARTNER_KEY ?? process.env.BANKR_API_KEY;
  if (!key) throw new Error("Missing BANKR_PARTNER_KEY env var");
  return {
    "Content-Type": "application/json",
    "X-Partner-Key": key,
  };
}

/* ── Types ─────────────────────────────────────────────────────────── */

interface DeployRequest {
  tokenName: string;
  tokenSymbol: string;
  description?: string;
  image?: string;
  websiteUrl?: string;
  tweetUrl?: string;
  feeRecipient: {
    type: "wallet" | "x" | "farcaster" | "ens";
    value: string;
  };
  simulateOnly?: boolean;
}

interface DeployResponse {
  success: boolean;
  tokenAddress: string;
  poolId: string;
  txHash?: string;
  activityId: string;
  chain: string;
  feeDistribution: {
    creator:   { address: string; bps: number };
    bankr:     { address: string; bps: number };
    partner?:  { address: string; bps: number };
    ecosystem: { address: string; bps: number };
    protocol:  { address: string; bps: number };
  };
}

/* ── Deploy ─────────────────────────────────────────────────────────── */

/**
 * Deploy a token via Bankr Partner Deploy API.
 * Returns the token address directly — no polling needed.
 */
export async function deployTokenViaBankr(params: {
  name: string;
  symbol: string;
  creatorPayout: string;   // EVM wallet fallback
  twitterHandle?: string;  // if provided, fees go here via Bankr X resolution
  description?: string;
  website?: string;
  githubUsername: string;
  avatarUrl?: string;      // GitHub avatar → token logo on Bankr/Doppler
}): Promise<{ tokenAddress: string; txHash: string; activityId: string }> {

  // feeRecipient: prefer Twitter handle if provided, else EVM wallet
  const feeRecipient = params.twitterHandle
    ? { type: "x" as const,      value: params.twitterHandle.replace(/^@/, "") }
    : { type: "wallet" as const, value: params.creatorPayout };

  const body: DeployRequest = {
    tokenName:    params.name,
    tokenSymbol:  params.symbol,
    description:  params.description,
    websiteUrl:   params.website || `https://github.com/${params.githubUsername}`,
    image:        params.avatarUrl,
    feeRecipient,
  };

  const res = await fetch(`${BANKR_API_BASE}/token-launches/deploy`, {
    method: "POST",
    headers: getPartnerHeaders(),
    body: JSON.stringify(body),
  });

  if (res.status === 401) {
    throw new Error("Invalid partner key. Check BANKR_PARTNER_KEY env var.");
  }
  if (res.status === 403) {
    const err = new Error(
      "Partner key not configured for deployment. Contact Bankr team."
    ) as Error & { code: string };
    err.code = "BANKR_PARTNER_NOT_CONFIGURED";
    throw err;
  }
  if (res.status === 429) {
    throw new Error("Bankr rate limit reached (50/day). Please wait and retry.");
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Bankr deploy error ${res.status}: ${body}`);
  }

  const data: DeployResponse = await res.json();

  if (!data.success || !data.tokenAddress) {
    throw new Error("Bankr deploy returned success=false or missing tokenAddress");
  }

  return {
    tokenAddress: data.tokenAddress,
    txHash:       data.txHash ?? "",
    activityId:   data.activityId,
  };
}

/* ── Legacy prompt helpers (kept for backward compat if needed) ─────── */

export function buildBankrPrompt(
  name: string,
  symbol: string,
  splitterAddress: string,
  githubUsername: string
): string {
  return (
    `Deploy a token called ${name} with symbol ${symbol} on Base. ` +
    `Set the fee beneficiary to ${splitterAddress}. ` +
    `Set the website to https://github.com/${githubUsername}. ` +
    `If additional info is needed, proceed with sensible defaults.`
  );
}

export function extractTokenAddress(
  text: string,
  excludeAddresses: string[] = []
): string | null {
  const lower   = text.toLowerCase();
  const exclude = excludeAddresses.map((a) => a.toLowerCase());
  const all     = [...text.matchAll(/0x[0-9a-fA-F]{40}/g)].map((m) => m[0]);
  if (all.length === 0) return null;
  const candidates = all.filter((a) => !exclude.includes(a.toLowerCase()));
  const keywords = ["deployed at", "token address", "contract address", "token:", "address:"];
  for (const kw of keywords) {
    const idx = lower.indexOf(kw);
    if (idx !== -1) {
      const m = text.slice(idx).match(/0x[0-9a-fA-F]{40}/);
      if (m && !exclude.includes(m[0].toLowerCase())) return m[0];
    }
  }
  return candidates.length > 0 ? candidates[candidates.length - 1] : all[all.length - 1];
}

const BANKR_API_BASE = "https://api.bankr.bot";

interface PromptResponse {
  jobId: string;
}

interface JobStatusResponse {
  jobId: string;
  status: "pending" | "running" | "completed" | "failed";
  response?: string; // Bankr returns freeform text here
  output?:   string; // fallback alias some versions use
  error?:    string;
}

function getHeaders(): Record<string, string> {
  const key = process.env.BANKR_API_KEY;
  if (!key) throw new Error("Missing BANKR_API_KEY");
  return {
    "Content-Type": "application/json",
    "X-API-Key": key,
  };
}

/**
 * Build the Bankr prompt for deploying a token on Base.
 */
export function buildBankrPrompt(
  name: string,
  symbol: string,
  splitterAddress: string,
  githubUsername: string
): string {
  const githubUrl = `https://github.com/${githubUsername}`;
  return (
    `Deploy a token called ${name} with symbol ${symbol} on Base. ` +
    `Set the fee beneficiary to ${splitterAddress}. ` +
    `Set the website to ${githubUrl}. ` +
    `If additional info is needed, proceed with sensible defaults.`
  );
}

/**
 * POST /agent/prompt — submit a deployment job to Bankr.
 */
export async function submitBankrPrompt(prompt: string): Promise<string> {
  const res = await fetch(`${BANKR_API_BASE}/agent/prompt`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ prompt }),
  });

  if (res.status === 403) {
    const err = new Error(
      "Bankr Agent API not enabled. Enable it at https://bankr.bot/settings."
    ) as Error & { code: string };
    err.code = "BANKR_AGENT_DISABLED";
    throw err;
  }

  if (res.status === 429) {
    throw new Error("Bankr rate limit reached. Please wait and retry.");
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Bankr prompt error ${res.status}: ${body}`);
  }

  const data: PromptResponse = await res.json();
  return data.jobId;
}

/**
 * GET /agent/job/{jobId} — poll job status.
 */
export async function getBankrJobStatus(
  jobId: string
): Promise<JobStatusResponse> {
  const res = await fetch(`${BANKR_API_BASE}/agent/job/${jobId}`, {
    headers: getHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Bankr job status error ${res.status}: ${body}`);
  }

  return res.json();
}

/**
 * Extract the token contract address from Bankr's freeform response text.
 *
 * Bankr returns natural language like:
 *   "Your token MyToken (SYMBOL) has been deployed at 0xABC...123 on Base."
 *
 * Strategy: collect ALL 0x addresses in the text, then exclude known
 * non-token addresses (splitter, treasury, etc.) and return the last one —
 * Bankr typically mentions the token address last.
 */
export function extractTokenAddress(
  text: string,
  excludeAddresses: string[] = []
): string | null {
  const lower = text.toLowerCase();
  const exclude = excludeAddresses.map((a) => a.toLowerCase());

  // Find all EVM addresses in the text
  const all = [...text.matchAll(/0x[0-9a-fA-F]{40}/g)].map((m) => m[0]);

  if (all.length === 0) return null;

  // Filter out excluded addresses
  const candidates = all.filter((a) => !exclude.includes(a.toLowerCase()));

  if (candidates.length === 0) return all[all.length - 1]; // fallback: last address

  // Prefer addresses near keywords like "deployed", "token", "contract"
  const keywords = ["deployed at", "token address", "contract address", "token:", "address:"];
  for (const kw of keywords) {
    const idx = lower.indexOf(kw);
    if (idx !== -1) {
      // Find the first address after this keyword
      const after = text.slice(idx);
      const m = after.match(/0x[0-9a-fA-F]{40}/);
      if (m && !exclude.includes(m[0].toLowerCase())) return m[0];
    }
  }

  // Default: last candidate
  return candidates[candidates.length - 1];
}

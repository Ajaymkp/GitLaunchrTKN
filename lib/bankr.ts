/**
 * lib/bankr.ts — Bankr Agent API (prompt endpoint)
 * Docs: https://docs.bankr.bot/agent-api/prompt-endpoint
 * Uses: BANKR_API_KEY (bk_...)
 */

const BANKR_API_BASE = "https://api.bankr.bot/agent";

function getHeaders(): Record<string, string> {
  const key = process.env.BANKR_API_KEY;
  if (!key) throw new Error("Missing BANKR_API_KEY env var");
  return { "Content-Type": "application/json", "X-API-Key": key };
}

/* ── Submit prompt ───────────────────────────────────────────────── */
async function submitPrompt(prompt: string): Promise<string> {
  const res = await fetch(`${BANKR_API_BASE}/prompt`, {
    method:  "POST",
    headers: getHeaders(),
    body:    JSON.stringify({ prompt }),
  });

  if (res.status === 403) {
    const err = new Error("Bankr Agent API not enabled. Enable at bankr.bot/api") as Error & { code: string };
    err.code = "BANKR_AGENT_DISABLED";
    throw err;
  }
  if (res.status === 429) throw new Error("Daily limit reached (3/day). Resets at UTC midnight.");
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Bankr prompt error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.jobId as string;
}

/* ── Poll job ────────────────────────────────────────────────────── */
async function waitForJob(jobId: string, timeoutMs = 120_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));

    const res = await fetch(`${BANKR_API_BASE}/job/${jobId}`, {
      headers: getHeaders(),
      cache:   "no-store",
    });

    if (!res.ok) continue;

    const job = await res.json();

    if (job.status === "completed") {
      const text = job.response ?? job.output ?? "";
      const addr = extractTokenAddress(text);
      if (addr) return addr;
      throw new Error(`Job completed but no token address found in response: ${text.slice(0, 200)}`);
    }

    if (job.status === "failed") {
      throw new Error(`Bankr job failed: ${job.error ?? "unknown error"}`);
    }
    // pending / running → keep polling
  }

  throw new Error("Bankr job timed out after 120s");
}

/* ── Main export ─────────────────────────────────────────────────── */
export async function deployTokenViaBankr(params: {
  name:           string;
  symbol:         string;
  twitterHandle:  string;
  description?:   string;
  website?:       string;
  githubUsername: string;
  avatarUrl?:     string;
}): Promise<{ tokenAddress: string; txHash: string; activityId: string }> {

  const handle  = params.twitterHandle.replace(/^@/, "");
  const website = params.website || `https://github.com/${params.githubUsername}`;

  // Be very explicit about fee routing so Bankr doesn't ignore it
  const prompt = [
    `Deploy a token on Base with these exact settings:`,
    `- Name: ${params.name}`,
    `- Symbol: ${params.symbol}`,
    `- Fee recipient: Twitter user @${handle} (type: x)`,
    `- Website: ${website}`,
    params.description ? `- Description: ${params.description}` : null,
    params.avatarUrl   ? `- Image: ${params.avatarUrl}` : null,
    `Route all creator fees to @${handle}. Do not use any other fee recipient.`,
    `Proceed without asking for confirmation.`,
  ].filter(Boolean).join("\n");

  const jobId = await submitPrompt(prompt);

  // Poll and wait for token address
  const tokenAddress = await waitForJob(jobId);

  return { tokenAddress, txHash: "", activityId: jobId };
}

/* ── Helper ──────────────────────────────────────────────────────── */
function extractTokenAddress(text: string): string | null {
  const keywords = ["deployed at", "token address", "contract address", "token:", "address:", "launched at"];
  const lower    = text.toLowerCase();

  for (const kw of keywords) {
    const idx = lower.indexOf(kw);
    if (idx !== -1) {
      const m = text.slice(idx).match(/0x[0-9a-fA-F]{40}/);
      if (m) return m[0];
    }
  }

  // Fallback: last 0x address in text
  const all = [...text.matchAll(/0x[0-9a-fA-F]{40}/g)];
  return all.length > 0 ? all[all.length - 1][0] : null;
}

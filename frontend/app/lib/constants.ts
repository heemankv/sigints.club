// Centralised constants for the sigints.club frontend.
// All env-var reads and magic strings live here.

// ─── Solana program IDs ───────────────────────────────────────────────────────

export const SUBSCRIPTION_PROGRAM_ID = process.env.NEXT_PUBLIC_SUBSCRIPTION_PROGRAM_ID ?? "";

export const STREAM_REGISTRY_PROGRAM_ID =
  process.env.NEXT_PUBLIC_STREAM_REGISTRY_PROGRAM_ID ?? "";

// ─── Solana cluster ───────────────────────────────────────────────────────────

export const SOLANA_CLUSTER =
  (process.env.NEXT_PUBLIC_SOLANA_CLUSTER as "mainnet-beta" | "devnet" | "testnet") ?? "devnet";

// ─── Explorer helpers ─────────────────────────────────────────────────────────

const EXPLORER_BASE = "https://explorer.solana.com";

export function explorerTx(sig: string): string {
  return `${EXPLORER_BASE}/tx/${sig}?cluster=${SOLANA_CLUSTER}`;
}

export function explorerAddress(address: string): string {
  return `${EXPLORER_BASE}/address/${address}?cluster=${SOLANA_CLUSTER}`;
}

// ─── Pricing / evidence label maps ───────────────────────────────────────────

export const PRICING_TYPE_LABELS: Record<string, string> = {
  subscription_unlimited: "Monthly subscription",
  free: "Free",
};

export const PRICING_TYPE_MAP: Record<string, number> = {
  subscription_unlimited: 1,
};

export const EVIDENCE_LEVEL_MAP: Record<string, number> = {
  trust: 0,
  verifier: 1,
};

// ─── Pagination ───────────────────────────────────────────────────────────────

export const FEED_COMMENTS_PAGE_SIZE = 3;
export const POST_COMMENTS_PAGE_SIZE = 10;

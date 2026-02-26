export type TradeToken = {
  symbol: string;
  mint: string;
  decimals: number;
};

export type TradeIntent = {
  provider: "Jupiter";
  inputSymbol: string;
  outputSymbol: string;
  inputMint: string;
  outputMint: string;
  inputDecimals: number;
  outputDecimals: number;
  amountUi: string;
  amountBaseUnits: string;
  slippageBps: number;
};

const DEVNET_TOKENS: Record<string, TradeToken> = {
  SOL: {
    symbol: "SOL",
    mint: "So11111111111111111111111111111111111111112",
    decimals: 9,
  },
  USDC: {
    symbol: "USDC",
    mint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
    decimals: 6,
  },
};

const TRADE_LINE = /(?:^|\n)\s*TRADE:\s*([^\n]+)/i;

function toBaseUnits(amount: string, decimals: number): string | null {
  if (!/^\d+(\.\d+)?$/.test(amount)) return null;
  const [whole, frac = ""] = amount.split(".");
  if (frac.length > decimals) return null;
  const padded = frac.padEnd(decimals, "0");
  const merged = `${whole}${padded}`.replace(/^0+/, "");
  return merged.length ? merged : "0";
}

export function parseTradeIntent(text: string): TradeIntent | null {
  if (!text) return null;
  const match = text.match(TRADE_LINE);
  if (!match) return null;

  const tokens = match[1].trim().split(/\s+/);
  const kv: Record<string, string> = {};
  for (const token of tokens) {
    const eq = token.indexOf("=");
    if (eq === -1) continue;
    const key = token.slice(0, eq).toLowerCase();
    const value = token.slice(eq + 1);
    if (!key || !value) continue;
    kv[key] = value;
  }

  const provider = (kv.provider ?? "").toLowerCase();
  if (provider && provider !== "jupiter") return null;

  const inputSymbol = (kv.input ?? "").toUpperCase();
  const outputSymbol = (kv.output ?? "").toUpperCase();
  const amountUi = kv.amount ?? "";
  const slippageBpsRaw = kv.slippagebps ?? kv.slippage ?? "50";
  const slippageBps = Number.parseInt(slippageBpsRaw, 10);
  if (!inputSymbol || !outputSymbol || !amountUi) return null;
  if (!Number.isFinite(slippageBps) || slippageBps < 0) return null;

  const inputToken = DEVNET_TOKENS[inputSymbol];
  const outputToken = DEVNET_TOKENS[outputSymbol];
  if (!inputToken || !outputToken) return null;

  const amountBaseUnits = toBaseUnits(amountUi, inputToken.decimals);
  if (!amountBaseUnits) return null;

  return {
    provider: "Jupiter",
    inputSymbol,
    outputSymbol,
    inputMint: inputToken.mint,
    outputMint: outputToken.mint,
    inputDecimals: inputToken.decimals,
    outputDecimals: outputToken.decimals,
    amountUi,
    amountBaseUnits,
    slippageBps,
  };
}

export function buildTradeActionUrl(
  intent: TradeIntent,
  apiBase?: string
): string {
  if (!apiBase) {
    throw new Error("apiBase is required to build trade action url");
  }
  const url = new URL("/actions/trade", apiBase);
  url.searchParams.set("provider", intent.provider);
  url.searchParams.set("inputMint", intent.inputMint);
  url.searchParams.set("outputMint", intent.outputMint);
  url.searchParams.set("amount", intent.amountBaseUnits);
  url.searchParams.set("slippageBps", String(intent.slippageBps));
  url.searchParams.set("inputSymbol", intent.inputSymbol);
  url.searchParams.set("outputSymbol", intent.outputSymbol);
  url.searchParams.set("amountUi", intent.amountUi);
  return url.toString();
}

export function buildTradeBlinkUrl(actionUrl: string, appBase?: string): string {
  if (!appBase) {
    throw new Error("appBase is required to build trade blink url");
  }
  return `${appBase.replace(/\/+$/, "")}/?action=${encodeURIComponent(actionUrl)}`;
}


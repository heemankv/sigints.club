import { LAMPORTS_PER_SOL } from "@solana/web3.js";

export function parseSolLamports(input: string): number {
  const match = input.match(/[\d.]+/);
  if (!match) return 0;
  const value = Number(match[0]);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * LAMPORTS_PER_SOL);
}

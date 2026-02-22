import { defineConfig } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Keypair } from "@solana/web3.js";

function resolveTestWalletPubkey() {
  if (process.env.NEXT_PUBLIC_TEST_WALLET_PUBKEY) {
    return process.env.NEXT_PUBLIC_TEST_WALLET_PUBKEY;
  }
  try {
    const keyPath = path.resolve(process.cwd(), "../accounts/taker.json");
    const raw = readFileSync(keyPath, "utf8");
    const kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
    return kp.publicKey.toBase58();
  } catch {
    return "";
  }
}

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3000",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_TEST_WALLET: process.env.NEXT_PUBLIC_TEST_WALLET ?? "true",
      NEXT_PUBLIC_TEST_WALLET_PUBKEY: resolveTestWalletPubkey(),
      NEXT_PUBLIC_TEST_WALLET_ACCOUNT: process.env.NEXT_PUBLIC_TEST_WALLET_ACCOUNT ?? "taker",
      NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://127.0.0.1:3001",
    },
  },
});

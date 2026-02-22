import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { Keypair } from "@solana/web3.js";
import { SigintsClient } from "../../sdk/src/index.ts";
import type { Server } from "node:http";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.PERSIST = "false";
  process.env.TEST_ALLOW_SUBSCRIBE_BYPASS = "true";
  process.env.TEST_KEYBOX_BYPASS = "true";
  const { createApp } = await import("../../backend/src/app.ts");
  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind test server");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

describe("SDK + backend integration", () => {
  it("registers subscriber, publishes signal, and decrypts", async () => {
    const client = new SigintsClient({
      rpcUrl: "http://127.0.0.1:8899",
      backendUrl: baseUrl,
      programId: "BMDH241mpXx3WHuRjWp7DpBrjmKSBYhttBgnFZd5aHYE",
    });

    const keys = SigintsClient.generateKeys();
    const subscriberWallet = Keypair.generate().publicKey.toBase58();
    await client.registerEncryptionKey("stream-eth", keys.publicKeyDerBase64, subscriberWallet);

    const payload = Buffer.from("integration-signal", "utf8").toString("base64");
    const resp = await fetch(`${baseUrl}/signals`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ streamId: "stream-eth", tierId: "trust", plaintextBase64: payload }),
    });
    expect(resp.ok).toBe(true);

    const meta = await client.fetchLatestSignal("stream-eth");
    expect(meta).not.toBeNull();
    const plaintext = await client.decryptSignal(meta!, {
      publicKeyDerBase64: keys.publicKeyDerBase64,
      privateKeyDerBase64: keys.privateKeyDerBase64,
    });
    expect(plaintext).toBe("integration-signal");
  });

  it("handles public signals without subscriber keys", async () => {
    const client = new SigintsClient({
      rpcUrl: "http://127.0.0.1:8899",
      backendUrl: baseUrl,
      programId: "BMDH241mpXx3WHuRjWp7DpBrjmKSBYhttBgnFZd5aHYE",
    });

    const payload = Buffer.from("public-integration", "utf8").toString("base64");
    const resp = await fetch(`${baseUrl}/signals`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        streamId: "stream-public",
        tierId: "tier-public",
        plaintextBase64: payload,
        visibility: "public",
      }),
    });
    expect(resp.ok).toBe(true);

    const meta = await client.fetchLatestSignal("stream-public");
    expect(meta).not.toBeNull();
    expect(meta?.visibility).toBe("public");
    const plaintext = await client.decryptSignal(meta!);
    expect(plaintext).toBe("public-integration");
  });
});

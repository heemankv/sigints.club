import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { PersonaClient } from "../../sdk/src/index.ts";
import type { Server } from "node:http";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.PERSIST = "false";
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
    const client = new PersonaClient({
      rpcUrl: "http://127.0.0.1:8899",
      backendUrl: baseUrl,
      programId: "BMDH241mpXx3WHuRjWp7DpBrjmKSBYhttBgnFZd5aHYE",
    });

    const keys = PersonaClient.generateKeys();
    await client.registerEncryptionKey("persona-eth", keys.publicKeyDerBase64);

    const payload = Buffer.from("integration-signal", "utf8").toString("base64");
    const resp = await fetch(`${baseUrl}/signals`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ personaId: "persona-eth", tierId: "trust", plaintextBase64: payload }),
    });
    expect(resp.ok).toBe(true);

    const meta = await client.fetchLatestSignal("persona-eth");
    expect(meta).not.toBeNull();
    const plaintext = await client.decryptSignal(meta!, {
      publicKeyDerBase64: keys.publicKeyDerBase64,
      privateKeyDerBase64: keys.privateKeyDerBase64,
    });
    expect(plaintext).toBe("integration-signal");
  });
});

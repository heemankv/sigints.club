import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { generateX25519Keypair } from "../../src/crypto/hybrid";
import type { Express } from "express";

let app: Express;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.PERSIST = "false";
  process.env.TEST_KEYBOX_BYPASS = "true";
  const mod = await import("../../src/app");
  app = mod.createApp();
});

describe("backend API", () => {
  it("publishes and retrieves signals", async () => {
    const kp = generateX25519Keypair();
    const streamId = "stream-api";
    const subscriberId = process.env.TEST_ONCHAIN_SUBSCRIBE === "true"
      ? await (async () => {
          const subscribeRes = await request(app)
            .post("/subscribe")
            .send({
              streamId,
              encPubKeyDerBase64: kp.publicKey.toString("base64"),
              subscriberWallet: "11111111111111111111111111111111",
            });
          expect(subscribeRes.status).toBe(200);
          expect(subscribeRes.body.subscriberId).toBeDefined();
          return subscribeRes.body.subscriberId as string;
        })()
      : null;

    const plaintext = Buffer.from("api-signal").toString("base64");
    const publishRes = await request(app).post("/signals").send({
      streamId,
      tierId: "tier-trust",
      plaintextBase64: plaintext,
    });
    expect(publishRes.status).toBe(200);
    expect(publishRes.body.metadata.signalHash).toHaveLength(64);

    const latestRes = await request(app)
      .get("/signals/latest")
      .query({ streamId });
    expect(latestRes.status).toBe(200);
    const meta = latestRes.body.signal;
    expect(meta.visibility).toBe("private");
    expect(meta.keyboxPointer).toBeTruthy();

    const byHash = await request(app)
      .get(`/signals/by-hash/${meta.signalHash}`);
    expect(byHash.status).toBe(200);

    const signalSha = meta.signalPointer.split("/").pop();
    const keyboxSha = meta.keyboxPointer.split("/").pop();

    const ciphertextRes = await request(app).get(`/storage/ciphertext/${signalSha}`);
    expect(ciphertextRes.status).toBe(200);
    expect(ciphertextRes.body.payload.ciphertext).toBeDefined();

    const keyboxRes = await request(app)
      .get(`/storage/keybox/${keyboxSha}`)
      .query(subscriberId ? { subscriberId } : {});
    expect(keyboxRes.status).toBe(200);
    if (subscriberId) {
      expect(keyboxRes.body.entry).toBeDefined();
    } else {
      expect(keyboxRes.body.keybox).toBeDefined();
    }
  });

  it("publishes public signals without keybox", async () => {
    const streamId = "stream-public";
    const plaintext = Buffer.from("public-signal").toString("base64");
    const publishRes = await request(app).post("/signals").send({
      streamId,
      tierId: "tier-public",
      plaintextBase64: plaintext,
      visibility: "public",
    });
    expect(publishRes.status).toBe(200);
    const meta = publishRes.body.metadata;
    expect(meta.visibility).toBe("public");
    expect(meta.keyboxPointer).toBeNull();
    expect(meta.signalPointer.startsWith("backend://public/")).toBe(true);
    const signalSha = meta.signalPointer.split("/").pop();
    const publicRes = await request(app).get(`/storage/public/${signalSha}`);
    expect(publicRes.status).toBe(200);
    expect(publicRes.body.payload.plaintext).toBe(plaintext);
  });
});

import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { generateX25519Keypair } from "../../src/crypto/hybrid";
import type { Express } from "express";

let app: Express;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.PERSIST = "false";
  const mod = await import("../../src/app");
  app = mod.createApp();
});

describe("backend API", () => {
  it("publishes and retrieves signals", async () => {
    const kp = generateX25519Keypair();
    const personaId = "persona-api";

    const subscribeRes = await request(app)
      .post("/subscribe")
      .send({ personaId, encPubKeyDerBase64: kp.publicKey.toString("base64") });
    expect(subscribeRes.status).toBe(200);
    expect(subscribeRes.body.subscriberId).toBeDefined();

    const plaintext = Buffer.from("api-signal").toString("base64");
    const publishRes = await request(app).post("/signals").send({
      personaId,
      tierId: "tier-trust",
      plaintextBase64: plaintext,
    });
    expect(publishRes.status).toBe(200);
    expect(publishRes.body.metadata.signalHash).toHaveLength(64);

    const latestRes = await request(app)
      .get("/signals/latest")
      .query({ personaId });
    expect(latestRes.status).toBe(200);
    const meta = latestRes.body.signal;

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
      .query({ subscriberId: subscribeRes.body.subscriberId });
    expect(keyboxRes.status).toBe(200);
    expect(keyboxRes.body.entry).toBeDefined();
  });
});

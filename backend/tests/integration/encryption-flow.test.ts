import { describe, expect, it } from "vitest";
import { BackendStorage } from "../../src/storage/providers/BackendStorage";
import { InMemoryMetadata } from "../../src/metadata/providers/InMemoryMetadata";
import { SignalService } from "../../src/services/SignalService";
import { ListenerService } from "../../src/services/ListenerService";
import { generateX25519Keypair } from "../../src/crypto/hybrid";


describe("Hybrid encryption flow", () => {
  it("publishes and decrypts a signal", async () => {
    const storage = new BackendStorage();
    const metadata = new InMemoryMetadata();
    const signalService = new SignalService(storage, metadata);
    const listenerService = new ListenerService(storage);

    const kp = generateX25519Keypair();
    const plaintext = Buffer.from("hello-signal", "utf8");

    await signalService.publishSignal(
      "streamA",
      "tier-1",
      plaintext,
      [{ encPubKeyDerBase64: kp.publicKey.toString("base64") }]
    );

    const signals = await metadata.listSignals("streamA");
    expect(signals.length).toBe(1);

    const decrypted = await listenerService.decryptLatestSignal(signals[0], {
      privateKeyDerBase64: kp.privateKey.toString("base64"),
      publicKeyDerBase64: kp.publicKey.toString("base64"),
    });

    expect(decrypted.toString("utf8")).toBe("hello-signal");
  });
});

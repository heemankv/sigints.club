import { describe, expect, it } from "vitest";
import { InMemoryMetadata } from "../../src/metadata/providers/InMemoryMetadata";


describe("Signal metadata flow", () => {
  it("stores and lists signals by persona", async () => {
    const store = new InMemoryMetadata();
    await store.addSignal({
      personaId: "personaA",
      tierId: "tier-1",
      signalHash: "a".repeat(64),
      signalPointer: "backend://ciphertext/abc",
      keyboxHash: "b".repeat(64),
      keyboxPointer: "backend://keybox/def",
      createdAt: Date.now(),
    });
    const signals = await store.listSignals("personaA");
    expect(signals.length).toBe(1);
    expect(signals[0].personaId).toBe("personaA");
  });
});

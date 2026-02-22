import { describe, expect, it } from "vitest";
import { InMemoryMetadata } from "../../src/metadata/providers/InMemoryMetadata";


describe("Signal metadata flow", () => {
  it("stores and lists signals by stream", async () => {
    const store = new InMemoryMetadata();
    await store.addSignal({
      streamId: "streamA",
      tierId: "tier-1",
      signalHash: "a".repeat(64),
      signalPointer: "backend://ciphertext/abc",
      keyboxHash: "b".repeat(64),
      keyboxPointer: "backend://keybox/def",
      visibility: "private",
      createdAt: Date.now(),
    });
    const signals = await store.listSignals("streamA");
    expect(signals.length).toBe(1);
    expect(signals[0].streamId).toBe("streamA");
  });
});

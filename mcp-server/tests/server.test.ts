import { beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { LoggingMessageNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "../src/server";

function createFakeClient() {
  const now = Date.now();
  const meta = {
    streamId: "stream-eth",
    tierId: "trust",
    signalHash: "a".repeat(64),
    signalPointer: "backend://ciphertext/abc",
    keyboxHash: "b".repeat(64),
    keyboxPointer: "backend://keybox/def",
    visibility: "private",
    createdAt: now,
  };

  return {
    fetchLatestSignal: async () => meta,
    decryptSignal: async () => "price:2000",
    fetchSignalRecordCreatedAt: async () => now,
    listenForSignals: async ({ onSignal }: any) => {
      const timer = setTimeout(() => {
        void onSignal({
          signalHash: meta.signalHash,
          metadata: meta,
          plaintext: "price:2000",
          slot: 42,
          createdAt: now,
          receivedAt: now + 50,
          ageMs: 50,
          blockTime: Math.floor(now / 1000),
        });
      }, 5);
      return () => clearTimeout(timer);
    },
  } as any;
}

describe("MCP server", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "test";
  });

  it("lists tools", async () => {
    const server = createServer(() => createFakeClient());
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.1.0" }, { capabilities: {} });
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name).sort();
    expect(names).toEqual(["check_stream_tick", "listen_stream_ticks", "stop_stream_ticks"].sort());
  });

  it("returns tick payload on check_stream_tick", async () => {
    const server = createServer(() => createFakeClient());
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.1.0" }, { capabilities: {} });
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const result = await client.callTool({
      name: "check_stream_tick",
      arguments: {
        streamId: "stream-eth",
        streamPubkey: "11111111111111111111111111111111",
        subscriberPublicKeyBase64: "cHVibGlj",
        subscriberPrivateKeyBase64: "cHJpdmF0ZQ==",
        backendUrl: "http://localhost:3001",
        rpcUrl: "http://127.0.0.1:8899",
        programId: "BMDH241mpXx3WHuRjWp7DpBrjmKSBYhttBgnFZd5aHYE",
        force: true,
      },
    });

    const payload = JSON.parse(result.content?.[0]?.text ?? "{}");
    expect(payload.signalHash).toBeDefined();
    expect(payload.plaintext).toBe("price:2000");
  });

  it("streams ticks via notifications/message", async () => {
    const server = createServer(() => createFakeClient());
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.1.0" }, { capabilities: { logging: {} } });
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    let received = false;
    client.setNotificationHandler(LoggingMessageNotificationSchema, (note) => {
      if (note.params?.data?.signalHash) {
        received = true;
      }
    });

    await client.callTool({
      name: "listen_stream_ticks",
      arguments: {
        streamId: "stream-eth",
        streamPubkey: "11111111111111111111111111111111",
        subscriberPublicKeyBase64: "cHVibGlj",
        subscriberPrivateKeyBase64: "cHJpdmF0ZQ==",
        backendUrl: "http://localhost:3001",
        rpcUrl: "http://127.0.0.1:8899",
        programId: "BMDH241mpXx3WHuRjWp7DpBrjmKSBYhttBgnFZd5aHYE",
      },
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(received).toBe(true);
  });
});

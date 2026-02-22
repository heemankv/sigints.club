import { SigintsClient, subscriberIdFromPubkey, KeyboxAuth } from "@sigints/sdk";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";

export type TickArgs = {
  streamId: string;
  streamPubkey: string;
  subscriberPublicKeyBase64?: string;
  subscriberPrivateKeyBase64?: string;
  walletSecretKeyBase58?: string;
  backendUrl: string;
  rpcUrl: string;
  programId: string;
  force?: boolean;
  maxAgeMs?: number;
};

export type ListenArgs = TickArgs;

type ClientFactory = (cfg: {
  rpcUrl: string;
  backendUrl: string;
  programId: string;
  keyboxAuth?: KeyboxAuth;
}) => SigintsClient;

function buildKeyboxAuth(secretKeyBase58?: string): KeyboxAuth | undefined {
  if (!secretKeyBase58) return undefined;
  const kp = Keypair.fromSecretKey(bs58.decode(secretKeyBase58));
  return {
    walletPubkey: kp.publicKey.toBase58(),
    signMessage: (message) => nacl.sign.detached(message, kp.secretKey),
  };
}

export function createServer(clientFactory: ClientFactory = (cfg) => new SigintsClient(cfg)) {
  const lastSeen = new Map<string, string>();
  const activeStreams = new Map<string, () => void>();

  const server = new Server(
    {
      name: "sigints-tick-server",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
        logging: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "check_stream_tick",
          description:
            "Check for the latest signal tick for a stream. Decrypts private signals for a subscriber; public signals require no keys.",
          inputSchema: {
            type: "object",
            properties: {
              streamId: { type: "string" },
              streamPubkey: { type: "string" },
              subscriberPublicKeyBase64: { type: "string" },
              subscriberPrivateKeyBase64: { type: "string" },
              walletSecretKeyBase58: { type: "string" },
              backendUrl: { type: "string" },
              rpcUrl: { type: "string" },
              programId: { type: "string" },
              force: { type: "boolean" },
              maxAgeMs: { type: "number" },
            },
            required: [
              "streamId",
              "streamPubkey",
              "backendUrl",
              "rpcUrl",
              "programId",
            ],
          },
        },
        {
          name: "listen_stream_ticks",
          description:
            "Start a long-running tick stream. Private signals require subscriber keys; public signals do not.",
          inputSchema: {
            type: "object",
            properties: {
              streamId: { type: "string" },
              streamPubkey: { type: "string" },
              subscriberPublicKeyBase64: { type: "string" },
              subscriberPrivateKeyBase64: { type: "string" },
              walletSecretKeyBase58: { type: "string" },
              backendUrl: { type: "string" },
              rpcUrl: { type: "string" },
              programId: { type: "string" },
              maxAgeMs: { type: "number" },
            },
            required: [
              "streamId",
              "streamPubkey",
              "backendUrl",
              "rpcUrl",
              "programId",
            ],
          },
        },
        {
          name: "stop_stream_ticks",
          description: "Stop a previously started tick stream by streamId.",
          inputSchema: {
            type: "object",
            properties: {
              streamId: { type: "string" },
            },
            required: ["streamId"],
          },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    if (name !== "check_stream_tick") {
      if (name === "listen_stream_ticks") {
        const input = args as ListenArgs;
        const listenId = input.streamId ?? randomUUID();
        if (activeStreams.has(listenId)) {
          return {
            content: [{ type: "text", text: `Stream already active: ${listenId}` }],
          };
        }
        const client = clientFactory({
          rpcUrl: input.rpcUrl,
          backendUrl: input.backendUrl,
          programId: input.programId,
          keyboxAuth: buildKeyboxAuth(input.walletSecretKeyBase58),
        });
        const subscriberKeys =
          input.subscriberPublicKeyBase64 && input.subscriberPrivateKeyBase64
            ? {
                publicKeyDerBase64: input.subscriberPublicKeyBase64,
                privateKeyDerBase64: input.subscriberPrivateKeyBase64,
              }
            : undefined;
        const stop = await client.listenForSignals({
          streamId: input.streamId,
          streamPubkey: input.streamPubkey,
          subscriberKeys,
          maxAgeMs: input.maxAgeMs,
          includeBlockTime: true,
          onSignal: async (tick) => {
            await server.sendLoggingMessage({
              level: "info",
              logger: "stream-ticks",
              data: {
                listenId,
                signalHash: tick.signalHash,
                streamId: tick.metadata.streamId,
                tierId: tick.metadata.tierId,
                visibility: tick.metadata.visibility ?? "private",
                createdAt: tick.createdAt,
                receivedAt: tick.receivedAt,
                ageMs: tick.ageMs,
                slot: tick.slot,
                blockTime: tick.blockTime,
                plaintext: tick.plaintext,
              },
            });
          },
          onError: async (err) => {
            await server.sendLoggingMessage({
              level: "error",
              logger: "stream-ticks",
              data: { listenId, error: err.message },
            });
          },
        });
        activeStreams.set(listenId, stop);
        return {
          content: [{ type: "text", text: JSON.stringify({ streamId: listenId }, null, 2) }],
        };
      }

      if (name === "stop_stream_ticks") {
        const input = args as { streamId: string };
        const stop = activeStreams.get(input.streamId);
        if (stop) {
          stop();
          activeStreams.delete(input.streamId);
          return { content: [{ type: "text", text: `Stopped stream ${input.streamId}` }] };
        }
        return { content: [{ type: "text", text: `Stream not found: ${input.streamId}` }] };
      }

      throw new Error(`Unknown tool: ${name}`);
    }
    const input = args as TickArgs;
    const client = clientFactory({
      rpcUrl: input.rpcUrl,
      backendUrl: input.backendUrl,
      programId: input.programId,
      keyboxAuth: buildKeyboxAuth(input.walletSecretKeyBase58),
    });

    const meta = await client.fetchLatestSignal(input.streamId);
    if (!meta) {
      return {
        content: [
          {
            type: "text",
            text: "No signals available yet.",
          },
        ],
      };
    }

    const visibility = meta.visibility ?? "private";
    let key = `${input.streamId}:public`;
    let subscriberKeys:
      | { publicKeyDerBase64: string; privateKeyDerBase64: string }
      | undefined = undefined;
    if (visibility === "private") {
      if (!input.subscriberPublicKeyBase64 || !input.subscriberPrivateKeyBase64) {
        throw new Error("subscriber keys required for private signals");
      }
      const subscriberId = subscriberIdFromPubkey(input.subscriberPublicKeyBase64);
      key = `${input.streamId}:${subscriberId}`;
      subscriberKeys = {
        publicKeyDerBase64: input.subscriberPublicKeyBase64,
        privateKeyDerBase64: input.subscriberPrivateKeyBase64,
      };
    }
    if (!input.force && lastSeen.get(key) === meta.signalHash) {
      return {
        content: [
          {
            type: "text",
            text: "No new tick.",
          },
        ],
      };
    }

    const plaintext = await client.decryptSignal(meta, subscriberKeys);

    lastSeen.set(key, meta.signalHash);
    const receivedAt = Date.now();
    const onchainCreatedAt =
      input.streamPubkey ? await client.fetchSignalRecordCreatedAt(input.streamPubkey, meta.signalHash) : null;
    const createdAt = onchainCreatedAt ?? meta.createdAt;
    const ageMs = receivedAt - createdAt;
    if (input.maxAgeMs && ageMs > input.maxAgeMs) {
      return {
        content: [
          {
            type: "text",
            text: "Latest tick is stale.",
          },
        ],
      };
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              signalHash: meta.signalHash,
              streamId: meta.streamId,
              tierId: meta.tierId,
              createdAt,
              receivedAt,
              ageMs,
              plaintext,
            },
            null,
            2
          ),
        },
      ],
    };
  });

  return server;
}

export async function startServer() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (process.env.NODE_ENV !== "test") {
  const isDirect = import.meta.url === pathToFileURL(process.argv[1] ?? "").href;
  if (isDirect) {
    startServer().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  }
}

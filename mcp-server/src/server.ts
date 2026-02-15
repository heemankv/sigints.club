import { PersonaClient, subscriberIdFromPubkey } from "@personafun/sdk";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";

type TickArgs = {
  personaId: string;
  personaPubkey: string;
  subscriberPublicKeyBase64: string;
  subscriberPrivateKeyBase64: string;
  backendUrl: string;
  rpcUrl: string;
  programId: string;
  force?: boolean;
  maxAgeMs?: number;
};

type ListenArgs = TickArgs & {
  streamId?: string;
};

const lastSeen = new Map<string, string>();
const activeStreams = new Map<string, () => void>();

const server = new Server(
  {
    name: "persona-fun-tick-server",
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
        name: "check_persona_tick",
        description:
          "Check for the latest signal tick for a persona, decrypt it for the subscriber, and return plaintext if new.",
        inputSchema: {
          type: "object",
          properties: {
            personaId: { type: "string" },
            personaPubkey: { type: "string" },
            subscriberPublicKeyBase64: { type: "string" },
            subscriberPrivateKeyBase64: { type: "string" },
            backendUrl: { type: "string" },
            rpcUrl: { type: "string" },
            programId: { type: "string" },
            force: { type: "boolean" },
            maxAgeMs: { type: "number" },
          },
          required: [
            "personaId",
            "personaPubkey",
            "subscriberPublicKeyBase64",
            "subscriberPrivateKeyBase64",
            "backendUrl",
            "rpcUrl",
            "programId",
          ],
        },
      },
      {
        name: "listen_persona_ticks",
        description:
          "Start a long-running tick stream. The server will emit notifications/message with tick payloads.",
        inputSchema: {
          type: "object",
          properties: {
            streamId: { type: "string" },
            personaId: { type: "string" },
            personaPubkey: { type: "string" },
            subscriberPublicKeyBase64: { type: "string" },
            subscriberPrivateKeyBase64: { type: "string" },
            backendUrl: { type: "string" },
            rpcUrl: { type: "string" },
            programId: { type: "string" },
            maxAgeMs: { type: "number" },
          },
          required: [
            "personaId",
            "personaPubkey",
            "subscriberPublicKeyBase64",
            "subscriberPrivateKeyBase64",
            "backendUrl",
            "rpcUrl",
            "programId",
          ],
        },
      },
      {
        name: "stop_persona_ticks",
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
  if (name !== "check_persona_tick") {
    if (name === "listen_persona_ticks") {
      const input = args as ListenArgs;
      const streamId = input.streamId ?? randomUUID();
      if (activeStreams.has(streamId)) {
        return {
          content: [{ type: "text", text: `Stream already active: ${streamId}` }],
        };
      }
      const client = new PersonaClient({
        rpcUrl: input.rpcUrl,
        backendUrl: input.backendUrl,
        programId: input.programId,
      });
      const stop = await client.listenForSignals({
        personaId: input.personaId,
        personaPubkey: input.personaPubkey,
        subscriberKeys: {
          publicKeyDerBase64: input.subscriberPublicKeyBase64,
          privateKeyDerBase64: input.subscriberPrivateKeyBase64,
        },
        maxAgeMs: input.maxAgeMs,
        includeBlockTime: true,
        onSignal: async (tick) => {
          await server.sendLoggingMessage({
            level: "info",
            logger: "persona-ticks",
            data: {
              streamId,
              signalHash: tick.signalHash,
              personaId: tick.metadata.personaId,
              tierId: tick.metadata.tierId,
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
            logger: "persona-ticks",
            data: { streamId, error: err.message },
          });
        },
      });
      activeStreams.set(streamId, stop);
      return {
        content: [{ type: "text", text: JSON.stringify({ streamId }, null, 2) }],
      };
    }

    if (name === "stop_persona_ticks") {
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
  const client = new PersonaClient({
    rpcUrl: input.rpcUrl,
    backendUrl: input.backendUrl,
    programId: input.programId,
  });

  const meta = await client.fetchLatestSignal(input.personaId);
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

  const subscriberId = subscriberIdFromPubkey(input.subscriberPublicKeyBase64);
  const key = `${input.personaId}:${subscriberId}`;
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

  const plaintext = await client.decryptSignal(meta, {
    publicKeyDerBase64: input.subscriberPublicKeyBase64,
    privateKeyDerBase64: input.subscriberPrivateKeyBase64,
  });

  lastSeen.set(key, meta.signalHash);
  const receivedAt = Date.now();
  const onchainCreatedAt =
    input.personaPubkey ? await client.fetchSignalRecordCreatedAt(input.personaPubkey, meta.signalHash) : null;
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
            personaId: meta.personaId,
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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

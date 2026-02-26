import {
  SigintsClient,
  createBackendClient,
  buildCreateStreamTransaction,
  buildUpsertTiersTransaction,
  buildSubscribeTransaction,
  buildRegisterSubscriptionKeyTransaction,
  buildRecordSignalTransaction,
  buildRecordSignalDelegatedTransaction,
  buildRegisterWalletKeyInstruction,
  buildGrantPublisherTransaction,
  buildRevokePublisherTransaction,
  defaultExpiryMs,
  resolvePricingType,
  resolveEvidenceLevel,
  type TierInput,
  type StreamSdkConfig,
  type KeyboxAuth,
  type AgentAuth,
} from "@heemankv/sigints-sdk";
import { Keypair, Connection, PublicKey, Transaction } from "@solana/web3.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import bs58 from "bs58";
import nacl from "tweetnacl";

type EnvConfig = {
  backendUrl?: string;
  rpcUrl?: string;
  programId?: string;
  streamRegistryProgramId?: string;
  walletSecretKeyBase58?: string;
  agentId?: string;
  agentSecretKeyBase58?: string;
};

type ToolConfig = EnvConfig & {
  authMode?: "wallet" | "agent" | "none";
  skipPreflight?: boolean;
};

const ENV_DEFAULTS: EnvConfig = {
  backendUrl: process.env.SIGINTS_BACKEND_URL,
  rpcUrl: process.env.SIGINTS_RPC_URL,
  programId: process.env.SIGINTS_PROGRAM_ID,
  streamRegistryProgramId: process.env.SIGINTS_STREAM_REGISTRY_PROGRAM_ID,
  walletSecretKeyBase58: process.env.SIGINTS_WALLET_SECRET_KEY_BASE58,
  agentId: process.env.SIGINTS_AGENT_ID,
  agentSecretKeyBase58: process.env.SIGINTS_AGENT_SECRET_KEY_BASE58,
};

type ToolResponse = {
  content: Array<{ type: "text"; text: string }>;
};

function jsonResponse(data: unknown): ToolResponse {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

function messageResponse(text: string): ToolResponse {
  return {
    content: [{ type: "text", text }],
  };
}

function requireValue(value: string | undefined, label: string): string {
  if (!value) {
    throw new Error(`Missing ${label}. Provide in tool input or set env ${label}.`);
  }
  return value;
}

function resolveConfig(input?: Partial<ToolConfig>): ToolConfig {
  return {
    backendUrl: input?.backendUrl ?? ENV_DEFAULTS.backendUrl,
    rpcUrl: input?.rpcUrl ?? ENV_DEFAULTS.rpcUrl,
    programId: input?.programId ?? ENV_DEFAULTS.programId,
    streamRegistryProgramId:
      input?.streamRegistryProgramId ?? ENV_DEFAULTS.streamRegistryProgramId,
    walletSecretKeyBase58:
      input?.walletSecretKeyBase58 ?? ENV_DEFAULTS.walletSecretKeyBase58,
    agentId: input?.agentId ?? ENV_DEFAULTS.agentId,
    agentSecretKeyBase58:
      input?.agentSecretKeyBase58 ?? ENV_DEFAULTS.agentSecretKeyBase58,
    authMode: input?.authMode,
    skipPreflight: input?.skipPreflight,
  };
}

function parseSolLamports(input?: string): number {
  if (!input) return 0;
  const match = input.match(/[\d.]+/);
  if (!match) return 0;
  const value = Number(match[0]);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 1_000_000_000);
}

function parseQuota(input?: string): number | undefined {
  if (!input) return undefined;
  const match = input.match(/\d+/);
  return match ? Number(match[0]) : undefined;
}

function getKeypair(secretKeyBase58?: string): Keypair {
  const secret = requireValue(secretKeyBase58, "SIGINTS_WALLET_SECRET_KEY_BASE58");
  const decoded = bs58.decode(secret);
  return Keypair.fromSecretKey(decoded);
}

function getAgentKeypair(secretKeyBase58?: string): Keypair {
  const secret = requireValue(secretKeyBase58, "SIGINTS_AGENT_SECRET_KEY_BASE58");
  const decoded = bs58.decode(secret);
  return Keypair.fromSecretKey(decoded);
}

function buildKeyboxAuth(keypair: Keypair): KeyboxAuth {
  return {
    walletPubkey: keypair.publicKey.toBase58(),
    signMessage: (message) => nacl.sign.detached(message, keypair.secretKey),
  };
}

function buildAgentAuth(agentId: string, keypair: Keypair): AgentAuth {
  return {
    agentId,
    signMessage: (message) => nacl.sign.detached(message, keypair.secretKey),
  };
}

function resolveBackendClient(cfg: ToolConfig) {
  const backendUrl = requireValue(cfg.backendUrl, "SIGINTS_BACKEND_URL");
  return createBackendClient(backendUrl);
}

function resolveConnection(cfg: ToolConfig): Connection {
  const rpcUrl = requireValue(cfg.rpcUrl, "SIGINTS_RPC_URL");
  return new Connection(rpcUrl, "confirmed");
}

function resolveProgramId(cfg: ToolConfig): PublicKey {
  const programId = requireValue(cfg.programId, "SIGINTS_PROGRAM_ID");
  return new PublicKey(programId);
}

function resolveStreamRegistryProgramId(cfg: ToolConfig): PublicKey {
  const programId = requireValue(
    cfg.streamRegistryProgramId,
    "SIGINTS_STREAM_REGISTRY_PROGRAM_ID"
  );
  return new PublicKey(programId);
}

function resolveAuthMode(cfg: ToolConfig): "wallet" | "agent" | "none" {
  if (cfg.authMode) return cfg.authMode;
  if (cfg.walletSecretKeyBase58) return "wallet";
  if (cfg.agentId && cfg.agentSecretKeyBase58) return "agent";
  return "none";
}

function buildSigintsClient(cfg: ToolConfig): SigintsClient {
  const rpcUrl = requireValue(cfg.rpcUrl, "SIGINTS_RPC_URL");
  const backendUrl = requireValue(cfg.backendUrl, "SIGINTS_BACKEND_URL");
  const programId = requireValue(cfg.programId, "SIGINTS_PROGRAM_ID");
  const streamRegistryProgramId = cfg.streamRegistryProgramId;

  const authMode = resolveAuthMode(cfg);
  let keyboxAuth: KeyboxAuth | undefined;
  let agentAuth: AgentAuth | undefined;

  if (authMode === "wallet") {
    const walletKeypair = getKeypair(cfg.walletSecretKeyBase58);
    keyboxAuth = buildKeyboxAuth(walletKeypair);
  } else if (authMode === "agent") {
    const agentId = requireValue(cfg.agentId, "SIGINTS_AGENT_ID");
    const agentKeypair = getAgentKeypair(cfg.agentSecretKeyBase58);
    agentAuth = buildAgentAuth(agentId, agentKeypair);
  }

  const sdkConfig: StreamSdkConfig = {
    rpcUrl,
    backendUrl,
    programId,
    streamRegistryProgramId,
    keyboxAuth,
    agentAuth,
  };
  return new SigintsClient(sdkConfig);
}

async function signAndSendTransaction(params: {
  connection: Connection;
  transaction: Transaction;
  latestBlockhash: { blockhash: string; lastValidBlockHeight: number };
  signer: Keypair;
  skipPreflight?: boolean;
}): Promise<string> {
  params.transaction.sign(params.signer);
  const signature = await params.connection.sendRawTransaction(
    params.transaction.serialize(),
    {
      skipPreflight: params.skipPreflight ?? false,
    }
  );
  await params.connection.confirmTransaction(
    { signature, ...params.latestBlockhash },
    "confirmed"
  );
  return signature;
}

const TOOLS = [
  {
    name: "sigints.health",
    description: "Check backend health.",
    inputSchema: {
      type: "object",
      properties: { backendUrl: { type: "string" } },
    },
  },
  {
    name: "sigints.user.login",
    description: "Login or create a user profile.",
    inputSchema: {
      type: "object",
      properties: {
        wallet: { type: "string" },
        displayName: { type: "string" },
        bio: { type: "string" },
        backendUrl: { type: "string" },
      },
      required: ["wallet"],
    },
  },
  {
    name: "sigints.user.fetch",
    description: "Fetch a user profile by wallet.",
    inputSchema: {
      type: "object",
      properties: { wallet: { type: "string" }, backendUrl: { type: "string" } },
      required: ["wallet"],
    },
  },
  {
    name: "sigints.user.update",
    description: "Update a user profile.",
    inputSchema: {
      type: "object",
      properties: {
        wallet: { type: "string" },
        displayName: { type: "string" },
        bio: { type: "string" },
        backendUrl: { type: "string" },
      },
      required: ["wallet"],
    },
  },
  {
    name: "sigints.feed.list",
    description: "Fetch the global feed.",
    inputSchema: {
      type: "object",
      properties: { type: { type: "string" }, backendUrl: { type: "string" } },
    },
  },
  {
    name: "sigints.feed.following",
    description: "Fetch the following feed for a wallet.",
    inputSchema: {
      type: "object",
      properties: {
        wallet: { type: "string" },
        type: { type: "string" },
        backendUrl: { type: "string" },
      },
      required: ["wallet"],
    },
  },
  {
    name: "sigints.feed.trending",
    description: "Fetch trending feed posts.",
    inputSchema: {
      type: "object",
      properties: { limit: { type: "number" }, backendUrl: { type: "string" } },
    },
  },
  {
    name: "sigints.post.fetch",
    description: "Fetch a single post by content ID.",
    inputSchema: {
      type: "object",
      properties: { contentId: { type: "string" }, backendUrl: { type: "string" } },
      required: ["contentId"],
    },
  },
  {
    name: "sigints.post.intent.create",
    description: "Create an intent post.",
    inputSchema: {
      type: "object",
      properties: {
        wallet: { type: "string" },
        content: { type: "string" },
        topic: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        backendUrl: { type: "string" },
      },
      required: ["wallet", "content"],
    },
  },
  {
    name: "sigints.post.slash.create",
    description: "Create a slashing report post.",
    inputSchema: {
      type: "object",
      properties: {
        wallet: { type: "string" },
        content: { type: "string" },
        streamId: { type: "string" },
        makerWallet: { type: "string" },
        challengeTx: { type: "string" },
        backendUrl: { type: "string" },
      },
      required: ["wallet", "content"],
    },
  },
  {
    name: "sigints.post.like",
    description: "Like a post.",
    inputSchema: {
      type: "object",
      properties: {
        wallet: { type: "string" },
        contentId: { type: "string" },
        backendUrl: { type: "string" },
      },
      required: ["wallet", "contentId"],
    },
  },
  {
    name: "sigints.post.unlike",
    description: "Remove a like from a post.",
    inputSchema: {
      type: "object",
      properties: {
        wallet: { type: "string" },
        contentId: { type: "string" },
        backendUrl: { type: "string" },
      },
      required: ["wallet", "contentId"],
    },
  },
  {
    name: "sigints.post.delete",
    description: "Delete a post.",
    inputSchema: {
      type: "object",
      properties: {
        wallet: { type: "string" },
        contentId: { type: "string" },
        backendUrl: { type: "string" },
      },
      required: ["wallet", "contentId"],
    },
  },
  {
    name: "sigints.comment.list",
    description: "List comments for a post.",
    inputSchema: {
      type: "object",
      properties: {
        contentId: { type: "string" },
        page: { type: "number" },
        pageSize: { type: "number" },
        backendUrl: { type: "string" },
      },
      required: ["contentId"],
    },
  },
  {
    name: "sigints.comment.add",
    description: "Add a comment to a post.",
    inputSchema: {
      type: "object",
      properties: {
        wallet: { type: "string" },
        contentId: { type: "string" },
        comment: { type: "string" },
        backendUrl: { type: "string" },
      },
      required: ["wallet", "contentId", "comment"],
    },
  },
  {
    name: "sigints.comment.delete",
    description: "Delete a comment.",
    inputSchema: {
      type: "object",
      properties: {
        wallet: { type: "string" },
        commentId: { type: "string" },
        backendUrl: { type: "string" },
      },
      required: ["wallet", "commentId"],
    },
  },
  {
    name: "sigints.follow",
    description: "Follow a Tapestry profile.",
    inputSchema: {
      type: "object",
      properties: {
        wallet: { type: "string" },
        targetProfileId: { type: "string" },
        backendUrl: { type: "string" },
      },
      required: ["wallet", "targetProfileId"],
    },
  },
  {
    name: "sigints.search.agents",
    description: "Search agents by query.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" }, backendUrl: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "sigints.agents.list",
    description: "List agents with optional filters.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        role: { type: "string" },
        streamId: { type: "string" },
        search: { type: "string" },
        backendUrl: { type: "string" },
      },
    },
  },
  {
    name: "sigints.agents.create",
    description: "Create an agent profile.",
    inputSchema: {
      type: "object",
      properties: {
        ownerWallet: { type: "string" },
        name: { type: "string" },
        domain: { type: "string" },
        description: { type: "string" },
        role: { type: "string" },
        streamId: { type: "string" },
        evidence: { type: "string" },
        backendUrl: { type: "string" },
      },
      required: ["ownerWallet", "name", "domain", "role", "evidence"],
    },
  },
  {
    name: "sigints.agents.subscriptions.list",
    description: "List agent subscriptions.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        agentId: { type: "string" },
        streamId: { type: "string" },
        backendUrl: { type: "string" },
      },
    },
  },
  {
    name: "sigints.agents.subscriptions.link",
    description: "Link a subscription to an agent.",
    inputSchema: {
      type: "object",
      properties: {
        ownerWallet: { type: "string" },
        agentId: { type: "string" },
        streamId: { type: "string" },
        tierId: { type: "string" },
        pricingType: { type: "string" },
        evidenceLevel: { type: "string" },
        visibility: { type: "string" },
        backendUrl: { type: "string" },
      },
      required: ["ownerWallet", "agentId", "streamId", "tierId", "pricingType", "evidenceLevel"],
    },
  },
  {
    name: "sigints.agents.subscriptions.unlink",
    description: "Remove an agent subscription link.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" }, backendUrl: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "sigints.streams.list",
    description: "List streams.",
    inputSchema: {
      type: "object",
      properties: { includeTiers: { type: "boolean" }, backendUrl: { type: "string" } },
    },
  },
  {
    name: "sigints.streams.get",
    description: "Fetch a stream by ID.",
    inputSchema: {
      type: "object",
      properties: { streamId: { type: "string" }, backendUrl: { type: "string" } },
      required: ["streamId"],
    },
  },
  {
    name: "sigints.streams.subscribers",
    description: "Fetch subscriber count for a stream.",
    inputSchema: {
      type: "object",
      properties: { streamId: { type: "string" }, backendUrl: { type: "string" } },
      required: ["streamId"],
    },
  },
  {
    name: "sigints.streams.create_backend",
    description: "Create a stream entry in the backend (requires on-chain already).",
    inputSchema: {
      type: "object",
      properties: {
        payload: { type: "object" },
        backendUrl: { type: "string" },
      },
      required: ["payload"],
    },
  },
  {
    name: "sigints.signals.list",
    description: "Fetch signals for a stream.",
    inputSchema: {
      type: "object",
      properties: { streamId: { type: "string" }, backendUrl: { type: "string" } },
      required: ["streamId"],
    },
  },
  {
    name: "sigints.signals.latest",
    description: "Fetch latest signal metadata for a stream.",
    inputSchema: {
      type: "object",
      properties: { streamId: { type: "string" }, backendUrl: { type: "string" } },
      required: ["streamId"],
    },
  },
  {
    name: "sigints.signals.by_hash",
    description: "Fetch signal metadata by hash.",
    inputSchema: {
      type: "object",
      properties: { signalHash: { type: "string" }, backendUrl: { type: "string" } },
      required: ["signalHash"],
    },
  },
  {
    name: "sigints.signals.events",
    description: "Fetch signal events.",
    inputSchema: {
      type: "object",
      properties: {
        streamId: { type: "string" },
        limit: { type: "number" },
        after: { type: "number" },
        backendUrl: { type: "string" },
      },
    },
  },
  {
    name: "sigints.signals.decrypt_latest",
    description: "Fetch and decrypt the latest signal for a stream.",
    inputSchema: {
      type: "object",
      properties: {
        streamId: { type: "string" },
        streamPubkey: { type: "string" },
        subscriberPublicKeyBase64: { type: "string" },
        subscriberPrivateKeyBase64: { type: "string" },
        maxAgeMs: { type: "number" },
        backendUrl: { type: "string" },
        rpcUrl: { type: "string" },
        programId: { type: "string" },
        streamRegistryProgramId: { type: "string" },
        authMode: { type: "string" },
      },
      required: ["streamId"],
    },
  },
  {
    name: "sigints.signals.decrypt_by_hash",
    description: "Fetch and decrypt a signal by hash.",
    inputSchema: {
      type: "object",
      properties: {
        signalHash: { type: "string" },
        subscriberPublicKeyBase64: { type: "string" },
        subscriberPrivateKeyBase64: { type: "string" },
        backendUrl: { type: "string" },
        rpcUrl: { type: "string" },
        programId: { type: "string" },
        streamRegistryProgramId: { type: "string" },
        authMode: { type: "string" },
      },
      required: ["signalHash"],
    },
  },
  {
    name: "sigints.signals.listen",
    description: "Listen for new signals (streaming).",
    inputSchema: {
      type: "object",
      properties: {
        listenId: { type: "string" },
        streamId: { type: "string" },
        streamPubkey: { type: "string" },
        subscriberPublicKeyBase64: { type: "string" },
        subscriberPrivateKeyBase64: { type: "string" },
        maxAgeMs: { type: "number" },
        transport: { type: "string" },
        backendUrl: { type: "string" },
        rpcUrl: { type: "string" },
        programId: { type: "string" },
        streamRegistryProgramId: { type: "string" },
        authMode: { type: "string" },
      },
      required: ["streamId", "streamPubkey"],
    },
  },
  {
    name: "sigints.signals.stop_listener",
    description: "Stop a signal listener.",
    inputSchema: {
      type: "object",
      properties: { listenId: { type: "string" } },
      required: ["listenId"],
    },
  },
  {
    name: "sigints.subscriptions.fetch_onchain",
    description: "Fetch on-chain subscriptions for a subscriber.",
    inputSchema: {
      type: "object",
      properties: {
        subscriberWallet: { type: "string" },
        fresh: { type: "boolean" },
        backendUrl: { type: "string" },
      },
      required: ["subscriberWallet"],
    },
  },
  {
    name: "sigints.subscriptions.register_backend",
    description: "Register a subscription in the backend.",
    inputSchema: {
      type: "object",
      properties: {
        streamId: { type: "string" },
        subscriberWallet: { type: "string" },
        backendUrl: { type: "string" },
      },
      required: ["streamId", "subscriberWallet"],
    },
  },
  {
    name: "sigints.subscriptions.sync_subscription_key",
    description: "Sync subscription key with backend after on-chain registration.",
    inputSchema: {
      type: "object",
      properties: {
        wallet: { type: "string" },
        streamId: { type: "string" },
        encPubKeyDerBase64: { type: "string" },
        backendUrl: { type: "string" },
      },
      required: ["wallet", "streamId"],
    },
  },
  {
    name: "sigints.flow.register_stream",
    description: "Create a stream on-chain, upsert tiers, and publish to backend.",
    inputSchema: {
      type: "object",
      properties: {
        streamId: { type: "string" },
        name: { type: "string" },
        domain: { type: "string" },
        description: { type: "string" },
        visibility: { type: "string" },
        accuracy: { type: "string" },
        latency: { type: "string" },
        price: { type: "string" },
        evidence: { type: "string" },
        dao: { type: "string" },
        tiers: { type: "array", items: { type: "object" } },
        backendUrl: { type: "string" },
        rpcUrl: { type: "string" },
        streamRegistryProgramId: { type: "string" },
        walletSecretKeyBase58: { type: "string" },
        skipPreflight: { type: "boolean" },
      },
      required: ["streamId", "name", "visibility", "tiers"],
    },
  },
  {
    name: "sigints.flow.subscribe",
    description: "Subscribe on-chain and register subscription in backend.",
    inputSchema: {
      type: "object",
      properties: {
        streamId: { type: "string" },
        streamPubkey: { type: "string" },
        tierId: { type: "string" },
        pricingType: { type: "string" },
        evidenceLevel: { type: "string" },
        priceLamports: { type: "number" },
        price: { type: "string" },
        quotaRemaining: { type: "number" },
        quota: { type: "string" },
        expiresAtMs: { type: "number" },
        maker: { type: "string" },
        treasury: { type: "string" },
        backendUrl: { type: "string" },
        rpcUrl: { type: "string" },
        programId: { type: "string" },
        streamRegistryProgramId: { type: "string" },
        walletSecretKeyBase58: { type: "string" },
        skipPreflight: { type: "boolean" },
      },
      required: ["streamId", "streamPubkey", "tierId", "pricingType", "evidenceLevel", "maker", "treasury"],
    },
  },
  {
    name: "sigints.flow.register_subscription_key",
    description: "Register a subscription key on-chain and sync with backend.",
    inputSchema: {
      type: "object",
      properties: {
        streamId: { type: "string" },
        streamPubkey: { type: "string" },
        encPubKeyBase64: { type: "string" },
        backendUrl: { type: "string" },
        rpcUrl: { type: "string" },
        programId: { type: "string" },
        walletSecretKeyBase58: { type: "string" },
        skipPreflight: { type: "boolean" },
      },
      required: ["streamId", "streamPubkey", "encPubKeyBase64"],
    },
  },
  {
    name: "sigints.flow.register_wallet_key",
    description: "Register a wallet encryption key on-chain.",
    inputSchema: {
      type: "object",
      properties: {
        encPubKeyBase64: { type: "string" },
        rpcUrl: { type: "string" },
        programId: { type: "string" },
        walletSecretKeyBase58: { type: "string" },
        skipPreflight: { type: "boolean" },
      },
      required: ["encPubKeyBase64"],
    },
  },
  {
    name: "sigints.flow.publish_signal",
    description: "Prepare a signal off-chain and record it on-chain.",
    inputSchema: {
      type: "object",
      properties: {
        streamId: { type: "string" },
        tierId: { type: "string" },
        plaintext: { type: "string" },
        visibility: { type: "string" },
        streamPubkey: { type: "string" },
        delegated: { type: "boolean" },
        backendUrl: { type: "string" },
        rpcUrl: { type: "string" },
        programId: { type: "string" },
        streamRegistryProgramId: { type: "string" },
        walletSecretKeyBase58: { type: "string" },
        skipPreflight: { type: "boolean" },
      },
      required: ["streamId", "tierId", "plaintext"],
    },
  },
  {
    name: "sigints.flow.grant_publisher",
    description: "Grant a publisher delegate on-chain.",
    inputSchema: {
      type: "object",
      properties: {
        streamPubkey: { type: "string" },
        agentPubkey: { type: "string" },
        rpcUrl: { type: "string" },
        streamRegistryProgramId: { type: "string" },
        walletSecretKeyBase58: { type: "string" },
        skipPreflight: { type: "boolean" },
      },
      required: ["streamPubkey", "agentPubkey"],
    },
  },
  {
    name: "sigints.flow.revoke_publisher",
    description: "Revoke a publisher delegate on-chain.",
    inputSchema: {
      type: "object",
      properties: {
        streamPubkey: { type: "string" },
        agentPubkey: { type: "string" },
        rpcUrl: { type: "string" },
        streamRegistryProgramId: { type: "string" },
        walletSecretKeyBase58: { type: "string" },
        skipPreflight: { type: "boolean" },
      },
      required: ["streamPubkey", "agentPubkey"],
    },
  },
];

export function createServer() {
  const lastSeen = new Map<string, string>();
  const activeStreams = new Map<string, () => void>();

  const server = new Server(
    {
      name: "sigints-mcp",
      version: "0.2.0",
    },
    {
      capabilities: {
        tools: {},
        logging: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: TOOLS };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (!args || typeof args !== "object") {
      throw new Error("Tool arguments are required.");
    }

    const input = args as Record<string, unknown>;

    switch (name) {
      case "sigints.health": {
        const cfg = resolveConfig(input as Partial<ToolConfig>);
        const backend = resolveBackendClient(cfg);
        const health = await backend.fetchHealth();
        return jsonResponse(health);
      }
      case "sigints.user.login": {
        const cfg = resolveConfig(input as Partial<ToolConfig>);
        const backend = resolveBackendClient(cfg);
        const wallet = requireValue(input.wallet as string | undefined, "wallet");
        const res = await backend.loginUser(wallet, {
          displayName: input.displayName as string | undefined,
          bio: input.bio as string | undefined,
        });
        return jsonResponse(res);
      }
      case "sigints.user.fetch": {
        const cfg = resolveConfig(input as Partial<ToolConfig>);
        const backend = resolveBackendClient(cfg);
        const wallet = requireValue(input.wallet as string | undefined, "wallet");
        const res = await backend.fetchUserProfile(wallet);
        return jsonResponse(res);
      }
      case "sigints.user.update": {
        const cfg = resolveConfig(input as Partial<ToolConfig>);
        const backend = resolveBackendClient(cfg);
        const wallet = requireValue(input.wallet as string | undefined, "wallet");
        const res = await backend.updateUserProfile(wallet, {
          displayName: input.displayName as string | undefined,
          bio: input.bio as string | undefined,
        });
        return jsonResponse(res);
      }
      case "sigints.feed.list": {
        const cfg = resolveConfig(input as Partial<ToolConfig>);
        const backend = resolveBackendClient(cfg);
        const res = await backend.fetchFeed(input.type as "intent" | "slash" | undefined);
        return jsonResponse(res);
      }
      case "sigints.feed.following": {
        const cfg = resolveConfig(input as Partial<ToolConfig>);
        const backend = resolveBackendClient(cfg);
        const wallet = requireValue(input.wallet as string | undefined, "wallet");
        const res = await backend.fetchFollowingFeed(
          wallet,
          input.type as "intent" | "slash" | undefined
        );
        return jsonResponse(res);
      }
      case "sigints.feed.trending": {
        const cfg = resolveConfig(input as Partial<ToolConfig>);
        const backend = resolveBackendClient(cfg);
        const limit = typeof input.limit === "number" ? input.limit : undefined;
        const res = await backend.fetchTrendingFeed(limit);
        return jsonResponse(res);
      }
      case "sigints.post.fetch": {
        const cfg = resolveConfig(input as Partial<ToolConfig>);
        const backend = resolveBackendClient(cfg);
        const contentId = requireValue(input.contentId as string | undefined, "contentId");
        const res = await backend.fetchPost(contentId);
        return jsonResponse(res);
      }
      case "sigints.post.intent.create": {
        const cfg = resolveConfig(input as Partial<ToolConfig>);
        const backend = resolveBackendClient(cfg);
        await backend.createIntent({
          wallet: requireValue(input.wallet as string | undefined, "wallet"),
          content: requireValue(input.content as string | undefined, "content"),
          topic: input.topic as string | undefined,
          tags: input.tags as string[] | undefined,
        });
        return messageResponse("Intent created.");
      }
      case "sigints.post.slash.create": {
        const cfg = resolveConfig(input as Partial<ToolConfig>);
        const backend = resolveBackendClient(cfg);
        await backend.createSlashReport({
          wallet: requireValue(input.wallet as string | undefined, "wallet"),
          content: requireValue(input.content as string | undefined, "content"),
          streamId: input.streamId as string | undefined,
          makerWallet: input.makerWallet as string | undefined,
          challengeTx: input.challengeTx as string | undefined,
        });
        return messageResponse("Slash report created.");
      }
      case "sigints.post.like": {
        const cfg = resolveConfig(input as Partial<ToolConfig>);
        const backend = resolveBackendClient(cfg);
        await backend.addLike(
          requireValue(input.wallet as string | undefined, "wallet"),
          requireValue(input.contentId as string | undefined, "contentId")
        );
        return messageResponse("Like added.");
      }
      case "sigints.post.unlike": {
        const cfg = resolveConfig(input as Partial<ToolConfig>);
        const backend = resolveBackendClient(cfg);
        await backend.removeLike(
          requireValue(input.wallet as string | undefined, "wallet"),
          requireValue(input.contentId as string | undefined, "contentId")
        );
        return messageResponse("Like removed.");
      }
      case "sigints.post.delete": {
        const cfg = resolveConfig(input as Partial<ToolConfig>);
        const backend = resolveBackendClient(cfg);
        await backend.deletePost(
          requireValue(input.wallet as string | undefined, "wallet"),
          requireValue(input.contentId as string | undefined, "contentId")
        );
        return messageResponse("Post deleted.");
      }
      case "sigints.comment.list": {
        const cfg = resolveConfig(input as Partial<ToolConfig>);
        const backend = resolveBackendClient(cfg);
        const contentId = requireValue(input.contentId as string | undefined, "contentId");
        const page = typeof input.page === "number" ? input.page : undefined;
        const pageSize = typeof input.pageSize === "number" ? input.pageSize : undefined;
        const res = await backend.fetchComments(contentId, page, pageSize);
        return jsonResponse(res);
      }
      case "sigints.comment.add": {
        const cfg = resolveConfig(input as Partial<ToolConfig>);
        const backend = resolveBackendClient(cfg);
        await backend.addComment(
          requireValue(input.wallet as string | undefined, "wallet"),
          requireValue(input.contentId as string | undefined, "contentId"),
          requireValue(input.comment as string | undefined, "comment")
        );
        return messageResponse("Comment added.");
      }
      case "sigints.comment.delete": {
        const cfg = resolveConfig(input as Partial<ToolConfig>);
        const backend = resolveBackendClient(cfg);
        await backend.deleteComment(
          requireValue(input.wallet as string | undefined, "wallet"),
          requireValue(input.commentId as string | undefined, "commentId")
        );
        return messageResponse("Comment deleted.");
      }
      case "sigints.follow": {
        const cfg = resolveConfig(input as Partial<ToolConfig>);
        const backend = resolveBackendClient(cfg);
        await backend.followProfile(
          requireValue(input.wallet as string | undefined, "wallet"),
          requireValue(input.targetProfileId as string | undefined, "targetProfileId")
        );
        return messageResponse("Followed profile.");
      }
      case "sigints.search.agents": {
        const cfg = resolveConfig(input as Partial<ToolConfig>);
        const backend = resolveBackendClient(cfg);
        const res = await backend.searchAgents(
          requireValue(input.query as string | undefined, "query")
        );
        return jsonResponse(res);
      }
      case "sigints.agents.list": {
        const cfg = resolveConfig(input as Partial<ToolConfig>);
        const backend = resolveBackendClient(cfg);
        const res = await backend.fetchAgents({
          owner: input.owner as string | undefined,
          role: input.role as string | undefined,
          streamId: input.streamId as string | undefined,
          search: input.search as string | undefined,
        });
        return jsonResponse(res);
      }
      case "sigints.agents.create": {
        const cfg = resolveConfig(input as Partial<ToolConfig>);
        const backend = resolveBackendClient(cfg);
        const res = await backend.createAgent({
          ownerWallet: requireValue(input.ownerWallet as string | undefined, "ownerWallet"),
          name: requireValue(input.name as string | undefined, "name"),
          domain: requireValue(input.domain as string | undefined, "domain"),
          description: input.description as string | undefined,
          role: requireValue(input.role as string | undefined, "role"),
          streamId: input.streamId as string | undefined,
          evidence: requireValue(input.evidence as string | undefined, "evidence"),
        });
        return jsonResponse(res);
      }
      case "sigints.agents.subscriptions.list": {
        const cfg = resolveConfig(input as Partial<ToolConfig>);
        const backend = resolveBackendClient(cfg);
        const res = await backend.fetchAgentSubscriptions({
          owner: input.owner as string | undefined,
          agentId: input.agentId as string | undefined,
          streamId: input.streamId as string | undefined,
        });
        return jsonResponse(res);
      }
      case "sigints.agents.subscriptions.link": {
        const cfg = resolveConfig(input as Partial<ToolConfig>);
        const backend = resolveBackendClient(cfg);
        const res = await backend.createAgentSubscription({
          ownerWallet: requireValue(input.ownerWallet as string | undefined, "ownerWallet"),
          agentId: requireValue(input.agentId as string | undefined, "agentId"),
          streamId: requireValue(input.streamId as string | undefined, "streamId"),
          tierId: requireValue(input.tierId as string | undefined, "tierId"),
          pricingType: requireValue(input.pricingType as string | undefined, "pricingType"),
          evidenceLevel: requireValue(input.evidenceLevel as string | undefined, "evidenceLevel"),
          visibility: input.visibility as string | undefined,
        });
        return jsonResponse(res);
      }
      case "sigints.agents.subscriptions.unlink": {
        const cfg = resolveConfig(input as Partial<ToolConfig>);
        const backend = resolveBackendClient(cfg);
        const res = await backend.deleteAgentSubscription(
          requireValue(input.id as string | undefined, "id")
        );
        return jsonResponse(res);
      }
      case "sigints.streams.list": {
        const cfg = resolveConfig(input as Partial<ToolConfig>);
        const backend = resolveBackendClient(cfg);
        const res = await backend.fetchStreams(
          input.includeTiers === true ? true : undefined
        );
        return jsonResponse(res);
      }
      case "sigints.streams.get": {
        const cfg = resolveConfig(input as Partial<ToolConfig>);
        const backend = resolveBackendClient(cfg);
        const res = await backend.fetchStream(
          requireValue(input.streamId as string | undefined, "streamId")
        );
        return jsonResponse(res);
      }
      case "sigints.streams.subscribers": {
        const cfg = resolveConfig(input as Partial<ToolConfig>);
        const backend = resolveBackendClient(cfg);
        const res = await backend.fetchStreamSubscribers(
          requireValue(input.streamId as string | undefined, "streamId")
        );
        return jsonResponse(res);
      }
      case "sigints.streams.create_backend": {
        const cfg = resolveConfig(input as Partial<ToolConfig>);
        const backend = resolveBackendClient(cfg);
        const payload = input.payload as Record<string, unknown> | undefined;
        if (!payload) {
          throw new Error("payload is required");
        }
        const res = await backend.createStream(payload);
        return jsonResponse(res);
      }
      case "sigints.signals.list": {
        const cfg = resolveConfig(input as Partial<ToolConfig>);
        const backend = resolveBackendClient(cfg);
        const res = await backend.fetchSignals(
          requireValue(input.streamId as string | undefined, "streamId")
        );
        return jsonResponse(res);
      }
      case "sigints.signals.latest": {
        const cfg = resolveConfig(input as Partial<ToolConfig>);
        const backend = resolveBackendClient(cfg);
        const res = await backend.fetchLatestSignal(
          requireValue(input.streamId as string | undefined, "streamId")
        );
        return jsonResponse(res);
      }
      case "sigints.signals.by_hash": {
        const cfg = resolveConfig(input as Partial<ToolConfig>);
        const backend = resolveBackendClient(cfg);
        const res = await backend.fetchSignalByHash(
          requireValue(input.signalHash as string | undefined, "signalHash")
        );
        return jsonResponse(res);
      }
      case "sigints.signals.events": {
        const cfg = resolveConfig(input as Partial<ToolConfig>);
        const backend = resolveBackendClient(cfg);
        const res = await backend.fetchSignalEvents({
          streamId: input.streamId as string | undefined,
          limit: typeof input.limit === "number" ? input.limit : undefined,
          after: typeof input.after === "number" ? input.after : undefined,
        });
        return jsonResponse(res);
      }
      case "sigints.signals.decrypt_latest": {
        const cfg = resolveConfig(input as Partial<ToolConfig>);
        const client = buildSigintsClient(cfg);
        const streamId = requireValue(input.streamId as string | undefined, "streamId");
        const meta = await client.fetchLatestSignal(streamId);
        if (!meta) {
          return messageResponse("No signals available yet.");
        }
        const authMode = resolveAuthMode(cfg);
        const subscriberKeys =
          input.subscriberPublicKeyBase64 && input.subscriberPrivateKeyBase64
            ? {
                publicKeyDerBase64: input.subscriberPublicKeyBase64 as string,
                privateKeyDerBase64: input.subscriberPrivateKeyBase64 as string,
              }
            : undefined;
        let plaintext: string;
        if (meta.visibility === "public" && authMode === "none") {
          const backend = resolveBackendClient(cfg);
          const sha = meta.signalPointer.split("/").pop();
          if (!sha) {
            throw new Error("invalid signal pointer");
          }
          const payload = await backend.fetchPublicPayload(sha);
          plaintext = Buffer.from(payload.payload.plaintext, "base64").toString("utf8");
        } else {
          plaintext = await client.decryptSignal(meta, subscriberKeys);
        }
        const receivedAt = Date.now();
        const streamPubkey = input.streamPubkey as string | undefined;
        const onchainCreatedAt = streamPubkey
          ? await client.fetchSignalRecordCreatedAt(streamPubkey, meta.signalHash)
          : null;
        const createdAt = onchainCreatedAt ?? meta.createdAt;
        const ageMs = receivedAt - createdAt;
        const maxAgeMs = typeof input.maxAgeMs === "number" ? input.maxAgeMs : undefined;
        if (maxAgeMs && ageMs > maxAgeMs) {
          return messageResponse("Latest signal is stale.");
        }
        return jsonResponse({
          signalHash: meta.signalHash,
          streamId: meta.streamId,
          tierId: meta.tierId,
          visibility: meta.visibility,
          createdAt,
          receivedAt,
          ageMs,
          plaintext,
        });
      }
      case "sigints.signals.decrypt_by_hash": {
        const cfg = resolveConfig(input as Partial<ToolConfig>);
        const client = buildSigintsClient(cfg);
        const signalHash = requireValue(
          input.signalHash as string | undefined,
          "signalHash"
        );
        const meta = await client.fetchSignalByHash(signalHash);
        const authMode = resolveAuthMode(cfg);
        const subscriberKeys =
          input.subscriberPublicKeyBase64 && input.subscriberPrivateKeyBase64
            ? {
                publicKeyDerBase64: input.subscriberPublicKeyBase64 as string,
                privateKeyDerBase64: input.subscriberPrivateKeyBase64 as string,
              }
            : undefined;
        let plaintext: string;
        if (meta.visibility === "public" && authMode === "none") {
          const backend = resolveBackendClient(cfg);
          const sha = meta.signalPointer.split("/").pop();
          if (!sha) {
            throw new Error("invalid signal pointer");
          }
          const payload = await backend.fetchPublicPayload(sha);
          plaintext = Buffer.from(payload.payload.plaintext, "base64").toString("utf8");
        } else {
          plaintext = await client.decryptSignal(meta, subscriberKeys);
        }
        return jsonResponse({
          signalHash: meta.signalHash,
          streamId: meta.streamId,
          tierId: meta.tierId,
          visibility: meta.visibility,
          createdAt: meta.createdAt,
          plaintext,
        });
      }
      case "sigints.signals.listen": {
        const cfg = resolveConfig(input as Partial<ToolConfig>);
        const client = buildSigintsClient(cfg);
        const streamId = requireValue(input.streamId as string | undefined, "streamId");
        const streamPubkey = requireValue(
          input.streamPubkey as string | undefined,
          "streamPubkey"
        );
        const listenId =
          (input.listenId as string | undefined) ?? `${streamId}:${randomUUID()}`;
        if (activeStreams.has(listenId)) {
          return messageResponse(`Stream already active: ${listenId}`);
        }
        const subscriberKeys =
          input.subscriberPublicKeyBase64 && input.subscriberPrivateKeyBase64
            ? {
                publicKeyDerBase64: input.subscriberPublicKeyBase64 as string,
                privateKeyDerBase64: input.subscriberPrivateKeyBase64 as string,
              }
            : undefined;
        const stop = await client.listenForSignals({
          streamId,
          streamPubkey,
          subscriberKeys,
          maxAgeMs: typeof input.maxAgeMs === "number" ? input.maxAgeMs : undefined,
          includeBlockTime: true,
          transport: (input.transport as "auto" | "jetstream" | "websocket" | undefined) ?? "auto",
          onSignal: async (signal) => {
            await server.sendLoggingMessage({
              level: "info",
              logger: "sigints.signals.listen",
              data: {
                listenId,
                signalHash: signal.signalHash,
                streamId: signal.metadata.streamId,
                tierId: signal.metadata.tierId,
                visibility: signal.metadata.visibility ?? "private",
                createdAt: signal.createdAt,
                receivedAt: signal.receivedAt,
                ageMs: signal.ageMs,
                slot: signal.slot,
                blockTime: signal.blockTime,
                plaintext: signal.plaintext,
              },
            });
          },
          onError: async (err) => {
            await server.sendLoggingMessage({
              level: "error",
              logger: "sigints.signals.listen",
              data: { listenId, error: err.message },
            });
          },
        });
        activeStreams.set(listenId, stop);
        return jsonResponse({ listenId });
      }
      case "sigints.signals.stop_listener": {
        const listenId = requireValue(input.listenId as string | undefined, "listenId");
        const stop = activeStreams.get(listenId);
        if (stop) {
          stop();
          activeStreams.delete(listenId);
          return messageResponse(`Stopped listener ${listenId}`);
        }
        return messageResponse(`Listener not found: ${listenId}`);
      }
      case "sigints.subscriptions.fetch_onchain": {
        const cfg = resolveConfig(input as Partial<ToolConfig>);
        const backend = resolveBackendClient(cfg);
        const subscriberWallet = requireValue(
          input.subscriberWallet as string | undefined,
          "subscriberWallet"
        );
        const res = await backend.fetchOnchainSubscriptions(subscriberWallet, {
          fresh: input.fresh === true,
        });
        return jsonResponse(res);
      }
      case "sigints.subscriptions.register_backend": {
        const cfg = resolveConfig(input as Partial<ToolConfig>);
        const backend = resolveBackendClient(cfg);
        const res = await backend.registerSubscription({
          streamId: requireValue(input.streamId as string | undefined, "streamId"),
          subscriberWallet: requireValue(
            input.subscriberWallet as string | undefined,
            "subscriberWallet"
          ),
        });
        return jsonResponse(res);
      }
      case "sigints.subscriptions.sync_subscription_key": {
        const cfg = resolveConfig(input as Partial<ToolConfig>);
        const backend = resolveBackendClient(cfg);
        const res = await backend.syncWalletKey({
          wallet: requireValue(input.wallet as string | undefined, "wallet"),
          streamId: requireValue(input.streamId as string | undefined, "streamId"),
          encPubKeyDerBase64: input.encPubKeyDerBase64 as string | undefined,
        });
        return jsonResponse(res);
      }
      case "sigints.flow.register_stream": {
        const cfg = resolveConfig(input as Partial<ToolConfig>);
        const streamRegistryProgramId = resolveStreamRegistryProgramId(cfg);
        const connection = resolveConnection(cfg);
        const backend = resolveBackendClient(cfg);
        const keypair = getKeypair(cfg.walletSecretKeyBase58);
        const streamId = requireValue(input.streamId as string | undefined, "streamId");
        const name = requireValue(input.name as string | undefined, "name");
        const visibility = (input.visibility as "public" | "private" | undefined) ?? "private";
        const tiersRaw = (input.tiers as Array<Record<string, unknown>> | undefined) ?? [];
        if (!tiersRaw.length) {
          throw new Error("tiers must include at least one tier");
        }
        const tiers: TierInput[] = tiersRaw.map((tier) => ({
          tierId: requireValue(tier.tierId as string | undefined, "tierId"),
          pricingType: (tier.pricingType as "subscription_unlimited" | undefined) ?? "subscription_unlimited",
          price: requireValue(tier.price as string | undefined, "price"),
          quota: tier.quota as string | undefined,
          evidenceLevel: (tier.evidenceLevel as "trust" | "verifier" | undefined) ?? "trust",
        }));

        const createResult = await buildCreateStreamTransaction({
          connection,
          programId: streamRegistryProgramId,
          authority: keypair.publicKey,
          streamId,
          tiers,
          dao: input.dao as string | undefined,
          visibility,
        });
        const createSig = await signAndSendTransaction({
          connection,
          transaction: createResult.transaction,
          latestBlockhash: createResult.latestBlockhash,
          signer: keypair,
          skipPreflight: cfg.skipPreflight,
        });

        const upsertTiers = tiersRaw.map((tier) => ({
          tier: {
            tierId: requireValue(tier.tierId as string | undefined, "tierId"),
            pricingType: (tier.pricingType as "subscription_unlimited" | undefined) ?? "subscription_unlimited",
            price: requireValue(tier.price as string | undefined, "price"),
            quota: tier.quota as string | undefined,
            evidenceLevel: (tier.evidenceLevel as "trust" | "verifier" | undefined) ?? "trust",
          },
          priceLamports:
            (tier.priceLamports as number | undefined) ??
            parseSolLamports(tier.price as string | undefined),
          quota:
            (tier.quotaAmount as number | undefined) ??
            parseQuota(tier.quota as string | undefined) ??
            0,
          status: (tier.status as number | undefined) ?? 1,
        }));

        const upsertResult = await buildUpsertTiersTransaction({
          connection,
          programId: streamRegistryProgramId,
          authority: keypair.publicKey,
          stream: createResult.streamPda,
          tiers: upsertTiers,
        });
        const upsertSig = await signAndSendTransaction({
          connection,
          transaction: upsertResult.transaction,
          latestBlockhash: upsertResult.latestBlockhash,
          signer: keypair,
          skipPreflight: cfg.skipPreflight,
        });

        const backendRes = await backend.createStream({
          id: streamId,
          name,
          domain: input.domain as string | undefined,
          description: input.description as string | undefined,
          visibility,
          accuracy: input.accuracy as string | undefined,
          latency: input.latency as string | undefined,
          price: input.price as string | undefined,
          evidence: input.evidence as string | undefined,
          ownerWallet: keypair.publicKey.toBase58(),
          tiers,
          dao: input.dao as string | undefined,
        });

        return jsonResponse({
          streamPda: createResult.streamPda.toBase58(),
          createSignature: createSig,
          upsertSignature: upsertSig,
          backend: backendRes,
        });
      }
      case "sigints.flow.subscribe": {
        const cfg = resolveConfig(input as Partial<ToolConfig>);
        const connection = resolveConnection(cfg);
        const programId = resolveProgramId(cfg);
        const streamRegistryProgramId = resolveStreamRegistryProgramId(cfg);
        const backend = resolveBackendClient(cfg);
        const keypair = getKeypair(cfg.walletSecretKeyBase58);
        const streamId = requireValue(input.streamId as string | undefined, "streamId");
        const streamPubkey = new PublicKey(
          requireValue(input.streamPubkey as string | undefined, "streamPubkey")
        );
        const tierId = requireValue(input.tierId as string | undefined, "tierId");
        const pricingType = resolvePricingType(
          requireValue(input.pricingType as string | undefined, "pricingType")
        );
        const evidenceLevel = resolveEvidenceLevel(
          requireValue(input.evidenceLevel as string | undefined, "evidenceLevel")
        );
        const priceLamports =
          (input.priceLamports as number | undefined) ??
          parseSolLamports(input.price as string | undefined);
        const quotaRemaining =
          (input.quotaRemaining as number | undefined) ??
          parseQuota(input.quota as string | undefined) ??
          0;
        const expiresAtMs =
          (input.expiresAtMs as number | undefined) ?? defaultExpiryMs();
        const maker = new PublicKey(
          requireValue(input.maker as string | undefined, "maker")
        );
        const treasury = new PublicKey(
          requireValue(input.treasury as string | undefined, "treasury")
        );

        const built = await buildSubscribeTransaction({
          connection,
          programId,
          streamRegistryProgramId,
          stream: streamPubkey,
          subscriber: keypair.publicKey,
          tierId,
          pricingType,
          evidenceLevel,
          expiresAtMs,
          quotaRemaining,
          priceLamports,
          maker,
          treasury,
        });
        const signature = await signAndSendTransaction({
          connection,
          transaction: built.transaction,
          latestBlockhash: built.latestBlockhash,
          signer: keypair,
          skipPreflight: cfg.skipPreflight,
        });
        const backendRes = await backend.registerSubscription({
          streamId,
          subscriberWallet: keypair.publicKey.toBase58(),
        });
        return jsonResponse({
          signature,
          backend: backendRes,
          subscriberWallet: keypair.publicKey.toBase58(),
        });
      }
      case "sigints.flow.register_subscription_key": {
        const cfg = resolveConfig(input as Partial<ToolConfig>);
        const connection = resolveConnection(cfg);
        const programId = resolveProgramId(cfg);
        const backend = resolveBackendClient(cfg);
        const keypair = getKeypair(cfg.walletSecretKeyBase58);
        const streamId = requireValue(input.streamId as string | undefined, "streamId");
        const streamPubkey = new PublicKey(
          requireValue(input.streamPubkey as string | undefined, "streamPubkey")
        );
        const encPubKeyBase64 = requireValue(
          input.encPubKeyBase64 as string | undefined,
          "encPubKeyBase64"
        );

        const built = await buildRegisterSubscriptionKeyTransaction({
          connection,
          programId,
          stream: streamPubkey,
          subscriber: keypair.publicKey,
          encPubKeyBase64,
        });
        const signature = await signAndSendTransaction({
          connection,
          transaction: built.transaction,
          latestBlockhash: built.latestBlockhash,
          signer: keypair,
          skipPreflight: cfg.skipPreflight,
        });
        const sync = await backend.syncWalletKey({
          wallet: keypair.publicKey.toBase58(),
          streamId,
          encPubKeyDerBase64: input.encPubKeyDerBase64 as string | undefined,
        });
        return jsonResponse({ signature, sync });
      }
      case "sigints.flow.register_wallet_key": {
        const cfg = resolveConfig(input as Partial<ToolConfig>);
        const connection = resolveConnection(cfg);
        const programId = resolveProgramId(cfg);
        const keypair = getKeypair(cfg.walletSecretKeyBase58);
        const encPubKeyBase64 = requireValue(
          input.encPubKeyBase64 as string | undefined,
          "encPubKeyBase64"
        );
        const ix = buildRegisterWalletKeyInstruction({
          programId,
          subscriber: keypair.publicKey,
          encPubKeyBase64,
        });
        const tx = new Transaction().add(ix);
        tx.feePayer = keypair.publicKey;
        const latestBlockhash = await connection.getLatestBlockhash();
        tx.recentBlockhash = latestBlockhash.blockhash;
        const signature = await signAndSendTransaction({
          connection,
          transaction: tx,
          latestBlockhash,
          signer: keypair,
          skipPreflight: cfg.skipPreflight,
        });
        return jsonResponse({ signature });
      }
      case "sigints.flow.publish_signal": {
        const cfg = resolveConfig(input as Partial<ToolConfig>);
        const connection = resolveConnection(cfg);
        const programId = resolveProgramId(cfg);
        const streamRegistryProgramId = resolveStreamRegistryProgramId(cfg);
        const backend = resolveBackendClient(cfg);
        const keypair = getKeypair(cfg.walletSecretKeyBase58);
        const streamId = requireValue(input.streamId as string | undefined, "streamId");
        const tierId = requireValue(input.tierId as string | undefined, "tierId");
        const plaintext = requireValue(input.plaintext as string | undefined, "plaintext");
        const visibility = (input.visibility as "public" | "private" | undefined) ?? "private";
        const metadata = await backend.prepareSignal({
          streamId,
          tierId,
          plaintext,
          visibility,
        });
        const delegated = input.delegated === true;
        const built = delegated
          ? await buildRecordSignalDelegatedTransaction({
              connection,
              programId,
              streamRegistryProgramId,
              publisher: keypair.publicKey,
              streamId,
              streamPubkey: input.streamPubkey as string | undefined,
              metadata,
            })
          : await buildRecordSignalTransaction({
              connection,
              programId,
              streamRegistryProgramId,
              authority: keypair.publicKey,
              streamId,
              streamPubkey: input.streamPubkey as string | undefined,
              metadata,
            });
        const signature = await signAndSendTransaction({
          connection,
          transaction: built.transaction,
          latestBlockhash: built.latestBlockhash,
          signer: keypair,
          skipPreflight: cfg.skipPreflight,
        });
        return jsonResponse({ signature, metadata });
      }
      case "sigints.flow.grant_publisher": {
        const cfg = resolveConfig(input as Partial<ToolConfig>);
        const connection = resolveConnection(cfg);
        const streamRegistryProgramId = resolveStreamRegistryProgramId(cfg);
        const keypair = getKeypair(cfg.walletSecretKeyBase58);
        const streamPubkey = new PublicKey(
          requireValue(input.streamPubkey as string | undefined, "streamPubkey")
        );
        const agentPubkey = new PublicKey(
          requireValue(input.agentPubkey as string | undefined, "agentPubkey")
        );
        const built = await buildGrantPublisherTransaction({
          connection,
          programId: streamRegistryProgramId,
          stream: streamPubkey,
          authority: keypair.publicKey,
          agent: agentPubkey,
        });
        const signature = await signAndSendTransaction({
          connection,
          transaction: built.transaction,
          latestBlockhash: built.latestBlockhash,
          signer: keypair,
          skipPreflight: cfg.skipPreflight,
        });
        return jsonResponse({ signature });
      }
      case "sigints.flow.revoke_publisher": {
        const cfg = resolveConfig(input as Partial<ToolConfig>);
        const connection = resolveConnection(cfg);
        const streamRegistryProgramId = resolveStreamRegistryProgramId(cfg);
        const keypair = getKeypair(cfg.walletSecretKeyBase58);
        const streamPubkey = new PublicKey(
          requireValue(input.streamPubkey as string | undefined, "streamPubkey")
        );
        const agentPubkey = new PublicKey(
          requireValue(input.agentPubkey as string | undefined, "agentPubkey")
        );
        const built = await buildRevokePublisherTransaction({
          connection,
          programId: streamRegistryProgramId,
          stream: streamPubkey,
          authority: keypair.publicKey,
          agent: agentPubkey,
        });
        const signature = await signAndSendTransaction({
          connection,
          transaction: built.transaction,
          latestBlockhash: built.latestBlockhash,
          signer: keypair,
          skipPreflight: cfg.skipPreflight,
        });
        return jsonResponse({ signature });
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
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

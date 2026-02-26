import { Router } from "express";
import { z } from "zod";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAccount,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import nacl from "tweetnacl";
import fs from "fs";
import path from "path";
import {
  signalService,
  discoveryService,
  onChainSubscriptionClient,
  signalStore,
  userProfileStore,
  agentProfileStore,
  agentSubscriptionProfileStore,
  socialServiceInstance,
  streamRegistry,
  tapestryStreamServiceInstance,
  tapestryClient,
} from "./services/ServiceContainer";
import { decodeSubscriptionAccount, type OnChainSubscription } from "./services/OnChainSubscriptionClient";
import { subscriberIdFromPubkey, generateX25519Keypair } from "./crypto/hybrid";
import { hashTiersHex } from "./streams/tiersHash";
import { sha256Bytes } from "./utils/hash";

const router = Router();

const TEST_WALLET_ENABLED = process.env.TEST_WALLET === "true";
const DEFAULT_TEST_WALLET_NAME = process.env.TEST_WALLET_NAME ?? "taker";
const cachedTestKeypairs = new Map<string, Keypair>();
const SAFE_WALLET_NAME = /^[a-z0-9_-]+$/i;

function resolveTestWalletPath(walletName?: string) {
  if (walletName) {
    const safe = walletName.trim();
    if (!SAFE_WALLET_NAME.test(safe)) {
      throw new Error("invalid test wallet name");
    }
    return path.resolve(process.cwd(), "..", "accounts", `${safe}.json`);
  }
  return (
    process.env.TEST_WALLET_PATH ??
    path.resolve(process.cwd(), "..", "accounts", `${DEFAULT_TEST_WALLET_NAME}.json`)
  );
}

function getTestWalletKeypair(walletName?: string): Keypair {
  const cacheKey = walletName ?? "default";
  const cached = cachedTestKeypairs.get(cacheKey);
  if (cached) {
    return cached;
  }
  const keyPath = resolveTestWalletPath(walletName);
  const raw = fs.readFileSync(keyPath, "utf8");
  const parsed = JSON.parse(raw);
  const secret = Uint8Array.from(parsed);
  const keypair = Keypair.fromSecretKey(secret);
  cachedTestKeypairs.set(cacheKey, keypair);
  return keypair;
}

function resolveWalletName(req: { query?: any; header?: (name: string) => string | undefined }): string | undefined {
  const queryName = req?.query?.wallet;
  if (typeof queryName === "string" && queryName.trim()) {
    return queryName.trim();
  }
  const headerName = req?.header?.("x-test-wallet");
  if (headerName && headerName.trim()) {
    return headerName.trim();
  }
  return undefined;
}

router.get("/health", (_req, res) => {
  return res.json({ ok: true, timestamp: Date.now() });
});

router.get("/config/solana", (_req, res) => {
  const subscriptionProgramId = process.env.SOLANA_SUBSCRIPTION_PROGRAM_ID;
  const streamRegistryProgramId = process.env.SOLANA_STREAM_REGISTRY_PROGRAM_ID;
  if (!subscriptionProgramId || !streamRegistryProgramId) {
    return res.status(503).json({ error: "solana program ids not configured" });
  }
  const rpcUrl = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
  return res.json({
    subscriptionProgramId,
    streamRegistryProgramId,
    rpcUrl,
  });
});

router.get("/test-wallet", (req, res) => {
  if (!TEST_WALLET_ENABLED) {
    return res.status(404).json({ error: "test wallet disabled" });
  }
  try {
    const walletName = resolveWalletName(req);
    const keypair = getTestWalletKeypair(walletName);
    return res.json({ wallet: keypair.publicKey.toBase58() });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message ?? "failed to load test wallet" });
  }
});

const testWalletSendSchema = z.object({
  transactionBase64: z.string().min(1),
  skipPreflight: z.boolean().optional(),
});

router.post("/test-wallet/send", async (req, res) => {
  if (!TEST_WALLET_ENABLED) {
    return res.status(404).json({ error: "test wallet disabled" });
  }
  const parsed = testWalletSendSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  try {
    const walletName = resolveWalletName(req);
    const keypair = getTestWalletKeypair(walletName);
    const rpcUrl = process.env.SOLANA_RPC_URL ?? "http://127.0.0.1:8899";
    const connection = new Connection(rpcUrl, "confirmed");
    const raw = Buffer.from(parsed.data.transactionBase64, "base64");
    let signature: string;
    let blockhash: string | undefined;
    let lastValidBlockHeight: number | undefined;
    try {
      const vtx = VersionedTransaction.deserialize(raw);
      const latest = await connection.getLatestBlockhash("confirmed");
      blockhash = latest.blockhash;
      lastValidBlockHeight = latest.lastValidBlockHeight;
      // Always refresh the blockhash for localnet to avoid stale hashes.
      vtx.message.recentBlockhash = blockhash;
      const accountKeys = vtx.message.getAccountKeys();
      const programIds = vtx.message.compiledInstructions.map((ix) =>
        accountKeys.get(ix.programIdIndex)
      );
      const uniquePrograms = Array.from(new Set(programIds.map((p) => p.toBase58())));
      const missingPrograms: string[] = [];
      for (const programId of uniquePrograms) {
        const info = await connection.getAccountInfo(new PublicKey(programId));
        if (!info || !info.executable) {
          missingPrograms.push(programId);
        }
      }
      if (missingPrograms.length) {
        return res.status(400).json({
          error: `Missing program(s): ${missingPrograms.join(", ")}`,
        });
      }
      vtx.sign([keypair]);
      signature = await connection.sendRawTransaction(vtx.serialize(), {
        skipPreflight: parsed.data.skipPreflight ?? false,
      });
    } catch {
      const tx = Transaction.from(raw);
      if (!tx.feePayer) {
        tx.feePayer = keypair.publicKey;
      }
      const latest = await connection.getLatestBlockhash("confirmed");
      blockhash = latest.blockhash;
      lastValidBlockHeight = latest.lastValidBlockHeight;
      tx.recentBlockhash = blockhash;
      const programIds = tx.instructions.map((ix) => ix.programId.toBase58());
      const uniquePrograms = Array.from(new Set(programIds));
      const missingPrograms: string[] = [];
      for (const programId of uniquePrograms) {
        const info = await connection.getAccountInfo(new PublicKey(programId));
        if (!info || !info.executable) {
          missingPrograms.push(programId);
        }
      }
      if (missingPrograms.length) {
        return res.status(400).json({
          error: `Missing program(s): ${missingPrograms.join(", ")}`,
        });
      }
      tx.partialSign(keypair);
      signature = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: parsed.data.skipPreflight ?? false,
      });
    }
    if (blockhash && lastValidBlockHeight) {
      const confirmation = await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed"
      );
      if (confirmation.value.err) {
        return res.status(500).json({ error: `Transaction failed: ${JSON.stringify(confirmation.value.err)}` });
      }
    }
    return res.json({ signature });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message ?? "test wallet send failed" });
  }
});

const testWalletSignSchema = z.object({
  messageBase64: z.string().min(1),
});

router.post("/test-wallet/sign-message", async (req, res) => {
  if (!TEST_WALLET_ENABLED) {
    return res.status(404).json({ error: "test wallet disabled" });
  }
  const parsed = testWalletSignSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  try {
    const walletName = resolveWalletName(req);
    const keypair = getTestWalletKeypair(walletName);
    const message = Buffer.from(parsed.data.messageBase64, "base64");
    const signature = nacl.sign.detached(message, keypair.secretKey);
    return res.json({ signatureBase64: Buffer.from(signature).toString("base64") });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message ?? "test wallet sign failed" });
  }
});

const storeSchema = z.object({
  payloadBase64: z.string(),
  sha256: z.string().length(64),
});

const signalSchema = z.object({
  streamId: z.string(),
  tierId: z.string(),
  plaintextBase64: z.string(),
  visibility: z.enum(["public", "private"]).optional(),
});

router.post("/signals", async (req, res) => {
  const parsed = signalSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const stream = await discoveryService.getStream(parsed.data.streamId);
  if (!stream && process.env.NODE_ENV !== "test") {
    return res.status(404).json({ error: "stream not found" });
  }
  const visibility = stream?.visibility ?? parsed.data.visibility ?? "private";
  let subscribers: { encPubKeyDerBase64: string }[] = [];
  if (visibility === "private") {
    try {
      subscribers = await resolveStreamSubscriberKeys(parsed.data.streamId);
    } catch (error: any) {
      return res.status(503).json({ error: error?.message ?? "subscriber lookup failed" });
    }
  }
  const publish = await signalService.publishSignal(
    parsed.data.streamId,
    parsed.data.tierId,
    Buffer.from(parsed.data.plaintextBase64, "base64"),
    subscribers.map((s) => ({ encPubKeyDerBase64: s.encPubKeyDerBase64 })),
    visibility
  );
  return res.json({ metadata: publish.metadata });
});

router.post("/signals/prepare", async (req, res) => {
  const parsed = signalSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const stream = await discoveryService.getStream(parsed.data.streamId);
  if (!stream && process.env.NODE_ENV !== "test") {
    return res.status(404).json({ error: "stream not found" });
  }
  const visibility = stream?.visibility ?? parsed.data.visibility ?? "private";
  let subscribers: { encPubKeyDerBase64: string }[] = [];
  if (visibility === "private") {
    try {
      subscribers = await resolveStreamSubscriberKeys(parsed.data.streamId);
    } catch (error: any) {
      return res.status(503).json({ error: error?.message ?? "subscriber lookup failed" });
    }
  }
  const publish = await signalService.publishSignal(
    parsed.data.streamId,
    parsed.data.tierId,
    Buffer.from(parsed.data.plaintextBase64, "base64"),
    subscribers.map((s) => ({ encPubKeyDerBase64: s.encPubKeyDerBase64 })),
    visibility
  );
  return res.json({ metadata: publish.metadata });
});

router.get("/signals", async (req, res) => {
  const streamId = req.query.streamId;
  if (!streamId || typeof streamId !== "string") {
    return res.status(400).json({ error: "streamId required" });
  }
  const signals = await signalStore.listSignals(streamId);
  return res.json({ signals });
});

router.get("/signals/events", async (req, res) => {
  const streamId = typeof req.query.streamId === "string" ? req.query.streamId : undefined;
  const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
  const afterRaw = typeof req.query.after === "string" ? Number(req.query.after) : undefined;
  const limit = Number.isFinite(limitRaw) ? limitRaw : streamId ? 10 : 20;
  const after = Number.isFinite(afterRaw) ? afterRaw : undefined;

  try {
    const events = streamId
      ? await signalStore.listSignalEvents(streamId, limit, after)
      : await signalStore.listRecentSignalEvents(limit, after);
    return res.json({ events });
  } catch (error: any) {
    return res.status(500).json({ error: error.message ?? "signal events fetch failed" });
  }
});

router.get("/signals/latest", async (req, res) => {
  const streamId = req.query.streamId;
  if (!streamId || typeof streamId !== "string") {
    return res.status(400).json({ error: "streamId required" });
  }
  const signals = await signalStore.listSignals(streamId);
  const latest = signals.sort((a, b) => b.createdAt - a.createdAt)[0];
  if (!latest) {
    return res.status(404).json({ error: "no signals" });
  }
  return res.json({ signal: latest });
});

router.get("/signals/by-hash/:hash", async (req, res) => {
  const hash = req.params.hash;
  const match = await signalStore.getSignalByHash(hash);
  if (!match) {
    return res.status(404).json({ error: "signal not found" });
  }
  return res.json({ signal: match });
});

router.get("/storage/ciphertext/:sha", async (req, res) => {
  const sha = req.params.sha;
  try {
    const payload = await signalStore.getPayloadByHash(sha);
    if (!payload || !("ciphertext" in payload)) {
      return res.status(404).json({ error: "ciphertext not found" });
    }
    return res.json({ payload });
  } catch (error: any) {
    return res.status(404).json({ error: error.message ?? "ciphertext not found" });
  }
});

router.get("/storage/public/:sha", async (req, res) => {
  const sha = req.params.sha;
  try {
    if (process.env.NODE_ENV === "test" && process.env.TEST_PUBLIC_BYPASS === "true") {
      const payload = await signalStore.getPayloadByHash(sha);
      if (!payload || !("plaintext" in payload)) {
        return res.status(404).json({ error: "public payload not found" });
      }
      return res.json({ payload });
    }

    const meta = await signalStore.getSignalByHash(sha);
    if (!meta) {
      return res.status(404).json({ error: "public payload not found" });
    }
    if ((meta.visibility ?? "private") !== "public") {
      return res.status(400).json({ error: "signal is not public" });
    }

    const wallet = typeof req.query.wallet === "string" ? req.query.wallet : undefined;
    const signature = typeof req.query.signature === "string" ? req.query.signature : undefined;
    const agentId = typeof req.query.agentId === "string" ? req.query.agentId : undefined;
    if (!signature || (!wallet && !agentId)) {
      return res.status(401).json({ error: "wallet or agentId + signature required" });
    }

    if (wallet) {
      const message = buildPublicMessage(sha);
      const walletPubkey = new PublicKey(wallet);
      if (!verifySignature(walletPubkey, signature, message)) {
        return res.status(401).json({ error: "invalid signature" });
      }
      try {
        await assertActiveSubscriptionNft(walletPubkey, meta.streamId);
      } catch (error: any) {
        const message = error?.message ?? "active subscription required";
        const status = message.includes("not configured") ? 503 : 403;
        return res.status(status).json({ error: message });
      }
    } else if (agentId) {
      const agent = await agentProfileStore.getAgent(agentId);
      if (!agent) {
        return res.status(404).json({ error: "agent not found" });
      }
      if (!agent.agentPubkey) {
        return res.status(403).json({ error: "agent public key missing" });
      }
      const message = buildPublicMessage(sha);
      const agentPubkey = new PublicKey(agent.agentPubkey);
      if (!verifySignature(agentPubkey, signature, message)) {
        return res.status(401).json({ error: "invalid signature" });
      }
      const linked = await agentSubscriptionProfileStore.listAgentSubscriptions({
        agentId,
        streamId: meta.streamId,
      });
      if (!linked.length) {
        return res.status(403).json({ error: "agent not linked to stream" });
      }
      const ownerWallet = new PublicKey(agent.ownerWallet);
      try {
        await assertActiveSubscriptionNft(ownerWallet, meta.streamId);
      } catch (error: any) {
        const message = error?.message ?? "active subscription required";
        const status = message.includes("not configured") ? 503 : 403;
        return res.status(status).json({ error: message });
      }
    }

    const payload = await signalStore.getPayloadByHash(sha);
    if (!payload || !("plaintext" in payload)) {
      return res.status(404).json({ error: "public payload not found" });
    }
    return res.json({ payload });
  } catch (error: any) {
    return res.status(404).json({ error: error.message ?? "public payload not found" });
  }
});

router.get("/storage/keybox/:sha", async (req, res) => {
  const sha = req.params.sha;
  const wallet = typeof req.query.wallet === "string" ? req.query.wallet : undefined;
  const agentId = typeof req.query.agentId === "string" ? req.query.agentId : undefined;
  const signature = typeof req.query.signature === "string" ? req.query.signature : undefined;
  const providedEncPubKey =
    typeof req.query.encPubKeyDerBase64 === "string" ? req.query.encPubKeyDerBase64 : undefined;
  const subscriberId = typeof req.query.subscriberId === "string" ? req.query.subscriberId : undefined;
  try {
    if (
      process.env.NODE_ENV === "test" &&
      process.env.TEST_KEYBOX_BYPASS === "true"
    ) {
      const parsed = await signalStore.getKeyboxByHash(sha);
      if (!parsed) {
        return res.status(404).json({ error: "keybox not found" });
      }
      if (subscriberId) {
        const entry = Array.isArray(parsed)
          ? parsed.find((k) => k.subscriberId === subscriberId)
          : parsed[subscriberId];
        if (!entry) {
          return res.status(404).json({ error: "subscriber entry not found" });
        }
        return res.json({ entry });
      }
      return res.json({ keybox: parsed });
    }

    const meta = await signalStore.getSignalByKeyboxHash(sha);
    if (!meta) {
      return res.status(404).json({ error: "keybox not found" });
    }
    if ((meta.visibility ?? "private") === "public") {
      return res.status(400).json({ error: "public stream signals do not have a keybox" });
    }

    if (!signature || (!wallet && !agentId)) {
      return res.status(401).json({ error: "wallet or agentId + signature required" });
    }
    const message = buildKeyboxMessage(sha);
    let ownerWallet: PublicKey;
    if (wallet) {
      const walletPubkey = new PublicKey(wallet);
      if (!verifySignature(walletPubkey, signature, message)) {
        return res.status(401).json({ error: "invalid signature" });
      }
      ownerWallet = walletPubkey;
    } else {
      const agent = await agentProfileStore.getAgent(agentId as string);
      if (!agent) {
        return res.status(404).json({ error: "agent not found" });
      }
      if (!agent.agentPubkey) {
        return res.status(403).json({ error: "agent public key missing" });
      }
      const agentPubkey = new PublicKey(agent.agentPubkey);
      if (!verifySignature(agentPubkey, signature, message)) {
        return res.status(401).json({ error: "invalid signature" });
      }
      const linked = await agentSubscriptionProfileStore.listAgentSubscriptions({
        agentId: agent.id,
        streamId: meta.streamId,
      });
      if (!linked.length) {
        return res.status(403).json({ error: "agent not linked to stream" });
      }
      ownerWallet = new PublicKey(agent.ownerWallet);
    }

    try {
      await assertActiveSubscriptionNft(ownerWallet, meta.streamId);
    } catch (error: any) {
      const message = error?.message ?? "active subscription required";
      const status = message.includes("not configured") ? 503 : 403;
      return res.status(status).json({ error: message });
    }

    let onchainEncPub: Uint8Array | null = null;
    try {
      onchainEncPub = await fetchSubscriptionKey(ownerWallet, meta.streamId);
    } catch (error: any) {
      return res.status(503).json({ error: error?.message ?? "subscription program not configured" });
    }
    if (!onchainEncPub) {
      return res.status(403).json({ error: "encryption key not registered" });
    }
    if (providedEncPubKey) {
      try {
        const provided = normalizeX25519PublicKey(providedEncPubKey).raw;
        if (!Buffer.from(onchainEncPub).equals(provided)) {
          return res.status(403).json({ error: "encryption key mismatch" });
        }
      } catch (error: any) {
        return res.status(403).json({ error: error?.message ?? "invalid encryption key" });
      }
    }
    const onchainDer = x25519RawToDer(onchainEncPub);
    const subscriberIdFinal = subscriberIdFromPubkey(onchainDer);

    const parsed = await signalStore.getKeyboxByHash(sha);
    if (!parsed) {
      return res.status(404).json({ error: "keybox not found" });
    }
    const entry = Array.isArray(parsed)
      ? parsed.find((k) => k.subscriberId === subscriberIdFinal)
      : parsed[subscriberIdFinal];
    if (!entry) {
      return res.status(404).json({ error: "subscriber entry not found" });
    }
    return res.json({ entry });
  } catch (error: any) {
    return res.status(404).json({ error: error.message ?? "keybox not found" });
  }
});

router.get("/feed", async (_req, res) => {
  const signals = await signalStore.listAllSignals();
  const feed = [];
  const recent = signals.sort((a, b) => b.createdAt - a.createdAt).slice(0, 50);
  for (const signal of recent) {
    const stream = await discoveryService.getStream(signal.streamId);
    feed.push({
      id: signal.signalHash,
      type: "signal",
      streamId: signal.streamId,
      streamName: stream?.name ?? signal.streamId,
      tierId: signal.tierId,
      visibility: signal.visibility ?? "private",
      createdAt: signal.createdAt,
      onchainTx: signal.onchainTx,
    });
  }
  return res.json({ feed });
});

router.get("/streams", async (req, res) => {
  const includeTiers =
    req.query.includeTiers === "true" || req.query.includeTiers === "1";
  if (!tapestryStreamServiceInstance) {
    return res.status(503).json({ error: "Tapestry is required for stream discovery" });
  }
  if (includeTiers) {
    const streams = await discoveryService.listStreamDetails();
    return res.json({ streams });
  }
  const streams = await discoveryService.listStreams();
  return res.json({ streams });
});

router.get("/streams/:id", async (req, res) => {
  if (!tapestryStreamServiceInstance) {
    return res.status(503).json({ error: "Tapestry is required for stream discovery" });
  }
  const stream = await discoveryService.getStream(req.params.id);
  if (!stream) {
    return res.status(404).json({ error: "stream not found" });
  }
  return res.json({ stream });
});

const actionAccountSchema = z.object({
  account: z.string().min(32),
});

const tradeQuerySchema = z.object({
  provider: z.string().optional(),
  inputMint: z.string().min(32),
  outputMint: z.string().min(32),
  amount: z.string().regex(/^\d+$/),
  slippageBps: z.string().optional(),
  inputSymbol: z.string().optional(),
  outputSymbol: z.string().optional(),
  amountUi: z.string().optional(),
});

function resolveOrbitflareJupBaseUrl(): string | null {
  const raw = (process.env.ORBITFLARE_JUP_BASE_URL ?? process.env.ORBITFLARE_BASE_URL ?? "").trim();
  if (!raw) return null;
  const trimmed = raw.replace(/\/+$/, "");
  if (trimmed.endsWith("/jup")) return trimmed;
  return `${trimmed}/jup`;
}

function buildOrbitflareHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const apiKey = (process.env.ORBITFLARE_API_KEY ?? "").trim();
  if (!apiKey) return headers;
  const headerName = (process.env.ORBITFLARE_API_HEADER ?? "X-API-KEY").trim();
  headers[headerName] = apiKey;
  return headers;
}

router.get("/actions/stream/:id", async (req, res) => {
  if (!tapestryStreamServiceInstance) {
    return res.status(503).json({ error: "Tapestry is required for stream discovery" });
  }
  const stream = await discoveryService.getStream(req.params.id);
  if (!stream) {
    return res.status(404).json({ error: "stream not found" });
  }
  const apiBase = resolveApiBaseUrl(req);
  const appBase = resolvePublicBaseUrl(req);
  const tiers = stream.tiers ?? [];
  const trustTier = tiers.find((tier) => tier.evidenceLevel === "trust") ?? tiers[0];
  const verifierTier = tiers.find((tier) => tier.evidenceLevel === "verifier");
  const wantsVerifier = stream.evidence?.toLowerCase?.().includes("verifier") || stream.evidence?.toLowerCase?.().includes("hybrid");
  const pickedTiers = wantsVerifier && verifierTier ? [trustTier, verifierTier] : trustTier ? [trustTier] : [];
  const uniqueTiers = pickedTiers.reduce<NonNullable<typeof trustTier>[]>((acc, tier) => {
    if (!tier) return acc;
    if (!acc.some((entry) => entry.tierId === tier.tierId)) {
      acc.push(tier);
    }
    return acc;
  }, []);
  const actions = uniqueTiers.map((tier) => {
    const tierId = encodeURIComponent(tier.tierId);
    const evidenceLabel = tier.evidenceLevel === "verifier" ? "Verifier" : "Trust";
    return {
      label: `Monthly · ${evidenceLabel} · ${tier.price}`,
      href: `${apiBase}/actions/stream/${stream.id}/subscribe?tierId=${tierId}`,
    };
  });
  const visibilityLine = stream.visibility === "private"
    ? "Private stream. Encryption key required to decrypt."
    : "Public stream. Subscription still required to access payloads.";
  const tierLine = actions.length > 1
    ? "Choose Trust or Verifier for this stream."
    : "Monthly subscription.";
  let lastSignalLine = "Last signal: n/a";
  try {
    const signals = await signalStore.listSignals(stream.id);
    const latest = signals.sort((a, b) => b.createdAt - a.createdAt)[0];
    if (latest?.createdAt) {
      lastSignalLine = `Last signal: ${formatTimeAgo(latest.createdAt)}`;
    }
  } catch {
    // ignore signal lookup failures
  }
  const onchainAddress = stream.onchainAddress ?? "n/a";
  const domainLine = `Domain: ${stream.domain || "n/a"}`;
  const visibilityTag = `Visibility: ${stream.visibility ?? "private"}`;
  const onchainLine = `On-chain: ${onchainAddress}`;
  const userDescription = stream.description?.trim() ? stream.description.trim() : "No description.";
  return res.json({
    type: "action",
    icon: `${appBase}/icon.svg`,
    title: `${stream.name} (${stream.id})`,
    description: `${userDescription}\n${domainLine}\n${visibilityTag}\n${onchainLine}\n${lastSignalLine}\n${tierLine}\n${visibilityLine}`,
    label: "Subscribe",
    links: { actions },
  });
});

router.get("/actions/stream/:id/link", async (req, res) => {
  const apiBase = resolveApiBaseUrl(req);
  const appBase = resolvePublicBaseUrl(req);
  const streamId = encodeURIComponent(req.params.id);
  const streamUrl = `${appBase}/stream/${streamId}`;
  const actionUrl = `${apiBase}/actions/stream/${streamId}`;
  const directBlinkUrl = `${appBase}/?action=${encodeURIComponent(actionUrl)}`;
  return res.json({
    streamUrl,
    actionUrl,
    blinkUrl: streamUrl,
    directBlinkUrl,
  });
});

router.get("/actions/trade", async (req, res) => {
  const parsed = tradeQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const provider = (parsed.data.provider ?? "jupiter").toLowerCase();
  if (provider !== "jupiter") {
    return res.status(400).json({ error: "unsupported provider" });
  }
  const apiBase = resolveApiBaseUrl(req);
  const appBase = resolvePublicBaseUrl(req);
  const inputSymbol = parsed.data.inputSymbol?.toUpperCase() ?? "TOKEN";
  const outputSymbol = parsed.data.outputSymbol?.toUpperCase() ?? "TOKEN";
  const amountUi = parsed.data.amountUi ?? parsed.data.amount;
  const slippageBps = parsed.data.slippageBps ?? "50";
  const actionHref = `${apiBase}/actions/trade/execute?` +
    new URLSearchParams({
      provider: "Jupiter",
      inputMint: parsed.data.inputMint,
      outputMint: parsed.data.outputMint,
      amount: parsed.data.amount,
      slippageBps,
      inputSymbol,
      outputSymbol,
      amountUi,
    }).toString();

  return res.json({
    type: "action",
    icon: `${appBase}/icon.svg`,
    title: `Swap ${amountUi} ${inputSymbol} → ${outputSymbol}`,
    description: `Powered by OrbitFlare + Jupiter.\nInput: ${parsed.data.inputMint}\nOutput: ${parsed.data.outputMint}\nSlippage: ${slippageBps} bps`,
    label: "Swap",
    links: {
      actions: [
        {
          label: "Execute Swap",
          href: actionHref,
        },
      ],
    },
  });
});

router.post("/actions/trade/execute", async (req, res) => {
  const parsedQuery = tradeQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    return res.status(400).json({ error: parsedQuery.error.flatten() });
  }
  const parsedBody = actionAccountSchema.safeParse(req.body);
  if (!parsedBody.success) {
    return res.status(400).json({ error: parsedBody.error.flatten() });
  }
  const provider = (parsedQuery.data.provider ?? "jupiter").toLowerCase();
  if (provider !== "jupiter") {
    return res.status(400).json({ error: "unsupported provider" });
  }

  const orbitBase = resolveOrbitflareJupBaseUrl();
  if (!orbitBase) {
    return res.status(503).json({ error: "OrbitFlare base URL not configured" });
  }
  const headers = buildOrbitflareHeaders();
  const slippageBps = parsedQuery.data.slippageBps ?? "50";

  try {
    const userPubkey = new PublicKey(parsedBody.data.account).toBase58();
    const quoteUrl = new URL(`${orbitBase}/quote`);
    quoteUrl.searchParams.set("inputMint", parsedQuery.data.inputMint);
    quoteUrl.searchParams.set("outputMint", parsedQuery.data.outputMint);
    quoteUrl.searchParams.set("amount", parsedQuery.data.amount);
    quoteUrl.searchParams.set("slippageBps", slippageBps);

    const quoteRes = await fetch(quoteUrl.toString(), {
      headers,
    });
    if (!quoteRes.ok) {
      const text = await quoteRes.text();
      return res.status(502).json({ error: `quote failed: ${text}` });
    }
    const quote = await quoteRes.json();

    const swapRes = await fetch(`${orbitBase}/swap`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: userPubkey,
        wrapAndUnwrapSol: true,
      }),
    });
    if (!swapRes.ok) {
      const text = await swapRes.text();
      return res.status(502).json({ error: `swap failed: ${text}` });
    }
    const swapData = await swapRes.json();
    const transaction =
      swapData.swapTransaction ??
      swapData.transaction ??
      swapData.tx ??
      null;
    if (!transaction) {
      return res.status(502).json({ error: "swap response missing transaction" });
    }

    const inputSymbol = parsedQuery.data.inputSymbol?.toUpperCase() ?? "TOKEN";
    const outputSymbol = parsedQuery.data.outputSymbol?.toUpperCase() ?? "TOKEN";
    const amountUi = parsedQuery.data.amountUi ?? parsedQuery.data.amount;
    return res.json({
      transaction,
      message: `Swap ${amountUi} ${inputSymbol} → ${outputSymbol} via Jupiter.`,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message ?? "swap failed" });
  }
});

router.post("/actions/stream/:id/subscribe", async (req, res) => {
  const parsed = actionAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  if (!tapestryStreamServiceInstance) {
    return res.status(503).json({ error: "Tapestry is required for stream discovery" });
  }
  if (!streamRegistry) {
    return res.status(503).json({ error: "stream registry not configured" });
  }
  const subscriptionProgramId = process.env.SOLANA_SUBSCRIPTION_PROGRAM_ID;
  const streamRegistryProgramId = process.env.SOLANA_STREAM_REGISTRY_PROGRAM_ID;
  if (!subscriptionProgramId || !streamRegistryProgramId) {
    return res.status(503).json({ error: "solana program ids not configured" });
  }
  const tierId = typeof req.query.tierId === "string" ? req.query.tierId : undefined;
  if (!tierId) {
    return res.status(400).json({ error: "tierId required" });
  }
  const stream = await discoveryService.getStream(req.params.id);
  if (!stream) {
    return res.status(404).json({ error: "stream not found" });
  }
  const tier = stream.tiers.find((entry) => entry.tierId === tierId);
  if (!tier) {
    return res.status(404).json({ error: "tier not found" });
  }
  if (!stream.authority || !stream.dao || !stream.onchainAddress) {
    return res.status(500).json({ error: "stream on-chain config missing" });
  }
  try {
    const subscriberPubkey = new PublicKey(parsed.data.account);
    const streamPubkey = streamRegistry.deriveStreamPda(stream.id);
    const priceValue = parsePriceValue(tier.price);
    const priceLamports = Math.round(priceValue * LAMPORTS_PER_SOL);
    const pricingType = resolvePricingType(tier.pricingType);
    const evidenceLevel = resolveEvidenceLevel(tier.evidenceLevel);
    const quotaRemaining = tier.quota ? Math.max(0, Number(tier.quota)) : 0;
    const ix = await buildSubscribeInstruction({
      programId: new PublicKey(subscriptionProgramId),
      streamRegistryProgramId: new PublicKey(streamRegistryProgramId),
      stream: streamPubkey,
      subscriber: subscriberPubkey,
      tierId,
      pricingType,
      evidenceLevel,
      expiresAtMs: defaultExpiryMs(),
      quotaRemaining,
      priceLamports,
      maker: new PublicKey(stream.authority),
      treasury: new PublicKey(stream.dao),
    });

    const rpcUrl = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
    const connection = new Connection(rpcUrl, "confirmed");
    const tx = new Transaction().add(ix);
    tx.feePayer = subscriberPubkey;
    const latest = await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = latest.blockhash;

    let needsKey = false;
    if (stream.visibility === "private") {
      const [subKeyPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("sub_key"), streamPubkey.toBuffer(), subscriberPubkey.toBuffer()],
        new PublicKey(subscriptionProgramId)
      );
      const subKeyAccount = await connection.getAccountInfo(subKeyPda, "confirmed");
      needsKey = !subKeyAccount;
    }

    const message = needsKey
      ? "Subscription created. Register your stream encryption key in the app to decrypt private signals. Soulbound subscription NFT will be minted to your wallet."
      : "Subscription created. Soulbound subscription NFT will be minted to your wallet.";

    const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
    return res.json({
      transaction: Buffer.from(serialized).toString("base64"),
      message,
    });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message ?? "failed to build subscription transaction" });
  }
});

router.get("/streams/:id/subscribers", async (req, res) => {
  if (!streamRegistry || !onChainSubscriptionClient) {
    return res.status(503).json({ error: "on-chain subscription client not configured" });
  }
  const streamId = req.params.id;
  try {
    const onchain = await streamRegistry.getStreamConfig(streamId);
    if (!onchain || onchain.status !== 1) {
      return res.json({ count: 0 });
    }
    const subs = await onChainSubscriptionClient.listSubscriptionsForStream(onchain.pda);
    return res.json({ count: subs.length });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message ?? "failed to load subscribers" });
  }
});

const tierSchema = z.object({
  tierId: z.string(),
  pricingType: z.literal("subscription_unlimited"),
  price: z.string(),
  quota: z.string().optional(),
  evidenceLevel: z.enum(["trust", "verifier"]),
});

const streamSchema = z.object({
  id: z.string(),
  name: z.string(),
  domain: z.string(),
  description: z.string(),
  visibility: z.enum(["public", "private"]).optional(),
  accuracy: z.string().optional(),
  latency: z.string().optional(),
  price: z.string(),
  evidence: z.string(),
  signalInterval: z.enum(["unintervalled", "intervalled"]).optional(),
  cronSchedule: z.string().optional(),
  ownerWallet: z.string(),
  tiers: z.array(tierSchema).min(1),
});

function parsePriceValue(input: string): number {
  const match = input.match(/[\d.]+/);
  if (!match) return 0;
  const value = Number(match[0]);
  if (!Number.isFinite(value)) return 0;
  return value;
}

function resolvePricingType(value: string): number {
  if (value === "subscription_unlimited") return 1;
  throw new Error(`Unsupported pricing type: ${value}`);
}

function resolveEvidenceLevel(value: string): number {
  if (value === "trust") return 0;
  if (value === "verifier") return 1;
  throw new Error(`Unsupported evidence level: ${value}`);
}

function defaultExpiryMs(): number {
  const days = 30;
  return Date.now() + days * 24 * 60 * 60 * 1000;
}

const SUBSCRIBE_DISCRIMINATOR = new Uint8Array([254, 28, 191, 138, 156, 179, 183, 53]);

function writeBigInt64LE(view: Uint8Array, value: bigint, offset: number) {
  let temp = BigInt(value);
  for (let i = 0; i < 8; i += 1) {
    view[offset + i] = Number(temp & 0xffn);
    temp >>= 8n;
  }
}

function writeUint32LE(view: Uint8Array, value: number, offset: number) {
  let temp = value >>> 0;
  for (let i = 0; i < 4; i += 1) {
    view[offset + i] = temp & 0xff;
    temp >>= 8;
  }
}

async function encodeSubscribeData(params: {
  tierId: string;
  pricingType: number;
  evidenceLevel: number;
  expiresAtMs: number;
  quotaRemaining: number;
  priceLamports: number;
}): Promise<Uint8Array> {
  const tierHash = await sha256Bytes(Buffer.from(params.tierId));
  const data = new Uint8Array(8 + 32 + 1 + 1 + 8 + 4 + 8);
  data.set(SUBSCRIBE_DISCRIMINATOR, 0);
  data.set(tierHash, 8);
  data[40] = params.pricingType;
  data[41] = params.evidenceLevel;
  writeBigInt64LE(data, BigInt(params.expiresAtMs), 42);
  writeUint32LE(data, params.quotaRemaining, 50);
  writeBigInt64LE(data, BigInt(params.priceLamports), 54);
  return data;
}

async function buildSubscribeInstruction(params: {
  programId: PublicKey;
  streamRegistryProgramId: PublicKey;
  stream: PublicKey;
  subscriber: PublicKey;
  tierId: string;
  pricingType: number;
  evidenceLevel: number;
  expiresAtMs: number;
  quotaRemaining: number;
  priceLamports: number;
  maker: PublicKey;
  treasury: PublicKey;
}): Promise<TransactionInstruction> {
  const data = await encodeSubscribeData(params);
  const [subscription] = PublicKey.findProgramAddressSync(
    [Buffer.from("subscription"), params.stream.toBuffer(), params.subscriber.toBuffer()],
    params.programId
  );
  const [subscriptionMint] = PublicKey.findProgramAddressSync(
    [Buffer.from("subscription_mint"), params.stream.toBuffer(), params.subscriber.toBuffer()],
    params.programId
  );
  const [streamState] = PublicKey.findProgramAddressSync(
    [Buffer.from("stream_state"), params.stream.toBuffer()],
    params.programId
  );
  const tierHash = await sha256Bytes(Buffer.from(params.tierId));
  const [tierConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("tier"), params.stream.toBuffer(), tierHash],
    params.streamRegistryProgramId
  );
  const subscriberAta = getAssociatedTokenAddressSync(
    subscriptionMint,
    params.subscriber,
    false,
    TOKEN_2022_PROGRAM_ID
  );
  return new TransactionInstruction({
    programId: params.programId,
    keys: [
      { pubkey: subscription, isSigner: false, isWritable: true },
      { pubkey: subscriptionMint, isSigner: false, isWritable: true },
      { pubkey: streamState, isSigner: false, isWritable: true },
      { pubkey: subscriberAta, isSigner: false, isWritable: true },
      { pubkey: params.stream, isSigner: false, isWritable: false },
      { pubkey: tierConfig, isSigner: false, isWritable: false },
      { pubkey: params.streamRegistryProgramId, isSigner: false, isWritable: false },
      { pubkey: params.subscriber, isSigner: true, isWritable: true },
      { pubkey: params.maker, isSigner: false, isWritable: true },
      { pubkey: params.treasury, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(data),
  });
}

function resolveForwarded(req: { protocol: string; get: (name: string) => string | undefined }) {
  const protoHeader = req.get("x-forwarded-proto");
  const hostHeader = req.get("x-forwarded-host");
  const proto = protoHeader ? protoHeader.split(",")[0].trim() : req.protocol;
  const host = hostHeader ? hostHeader.split(",")[0].trim() : req.get("host");
  return { proto, host };
}

function resolvePublicBaseUrl(req: { protocol: string; get: (name: string) => string | undefined }) {
  const configured = process.env.PUBLIC_APP_URL ?? process.env.FRONTEND_URL;
  if (configured) return configured;
  const origin = req.get("origin");
  if (origin && /^https?:\/\//i.test(origin)) {
    return origin;
  }
  const { proto, host } = resolveForwarded(req);
  return `${proto}://${host}`;
}

function resolveApiBaseUrl(req: { protocol: string; get: (name: string) => string | undefined }) {
  if (process.env.PUBLIC_API_URL) return process.env.PUBLIC_API_URL;
  const { proto, host } = resolveForwarded(req);
  return `${proto}://${host}`;
}

function formatTimeAgo(timestampMs?: number | null): string {
  if (!timestampMs) return "n/a";
  const deltaMs = Date.now() - timestampMs;
  if (deltaMs < 0) return "just now";
  const seconds = Math.floor(deltaMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

router.post("/streams", async (req, res) => {
  if (!streamRegistry) {
    return res.status(503).json({ error: "stream registry not configured" });
  }
  if (!tapestryStreamServiceInstance) {
    return res.status(503).json({ error: "Tapestry is required for stream discovery" });
  }
  const parsed = streamSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const tiersHash = hashTiersHex(parsed.data.tiers);
  const onchain = await streamRegistry.getStreamConfig(parsed.data.id);
  if (!onchain) {
    return res.status(400).json({ error: "stream not registered on-chain" });
  }
  const onchainVisibility = onchain.visibility === 0 ? "public" : "private";
  const visibility = parsed.data.visibility ?? onchainVisibility;
  if (visibility !== onchainVisibility) {
    return res.status(400).json({ error: "visibility mismatch with on-chain config" });
  }
  if (visibility === "public") {
    const basePrice = parsePriceValue(parsed.data.price);
    const tierPrices = parsed.data.tiers.map((tier) => parsePriceValue(tier.price));
    if (basePrice > 0 || tierPrices.some((val) => val > 0)) {
      return res.status(400).json({ error: "public streams must be free (price = 0)" });
    }
  }
  if (onchain.status !== 1) {
    return res.status(400).json({ error: "stream is not active" });
  }
  if (onchain.authority !== parsed.data.ownerWallet) {
    return res.status(403).json({ error: "wallet is not stream authority" });
  }
  if (onchain.tiersHashHex !== tiersHash) {
    return res.status(400).json({ error: "tiers hash mismatch with on-chain" });
  }
  let tapestryProfileId: string;
  try {
    tapestryProfileId = await tapestryStreamServiceInstance.upsertStream(
      {
        streamId: parsed.data.id,
        name: parsed.data.name,
        domain: parsed.data.domain,
        description: parsed.data.description,
        visibility,
        accuracy: parsed.data.accuracy ?? "",
        latency: parsed.data.latency ?? "",
        price: parsed.data.price,
        evidence: parsed.data.evidence,
        signalInterval: parsed.data.signalInterval,
        cronSchedule: parsed.data.cronSchedule,
        ownerWallet: parsed.data.ownerWallet,
        authority: onchain.authority,
        dao: onchain.dao,
        onchainAddress: onchain.pda,
      },
      parsed.data.tiers
    );
  } catch (error: any) {
    return res.status(500).json({ error: error.message ?? "Tapestry stream sync failed" });
  }
  return res.json({
    stream: {
      ...parsed.data,
      onchainAddress: onchain.pda,
      visibility,
      tapestryProfileId,
    },
  });
});

router.get("/requests", async (_req, res) => {
  const requests = await discoveryService.listRequests();
  return res.json({ requests });
});

const loginSchema = z.object({
  wallet: z.string(),
  displayName: z.string().optional(),
  bio: z.string().optional(),
});

async function fetchTapestryProfileByWallet(wallet: string, cachedProfileId?: string) {
  if (cachedProfileId) {
    try {
      const details = await tapestryClient.getProfileDetails(cachedProfileId);
      if (details?.profile?.id) {
        const isStream = await tapestryClient.isStreamProfile(details.profile.id);
        if (!isStream) return details.profile;
      }
    } catch (error) {
      console.warn("Tapestry profile details lookup failed", error);
    }
  }

  try {
    const entry = await tapestryClient.findUserProfileByWallet(wallet);
    if (entry?.profile?.id) return entry.profile;
  } catch (error) {
    console.warn("Tapestry profile lookup by wallet failed", error);
  }

  return null;
}

function readCustomProperty(profile: any, key: string): string | undefined {
  const raw = profile?.customProperties;
  if (!raw) return undefined;
  if (Array.isArray(raw)) {
    const match = raw.find((item) => item?.key === key);
    if (match?.value === undefined || match?.value === null) return undefined;
    return String(match.value);
  }
  if (typeof raw === "object") {
    const value = raw[key];
    if (value === undefined || value === null) return undefined;
    return String(value);
  }
  return undefined;
}

router.post("/users/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  let profile = await userProfileStore.upsertUser(parsed.data.wallet, {
    displayName: parsed.data.displayName,
    bio: parsed.data.bio,
  });
  try {
    const profileId = await socialServiceInstance.ensureProfile(parsed.data.wallet, parsed.data.displayName);
    if (profileId && (parsed.data.displayName || parsed.data.bio)) {
      await tapestryClient.updateProfileCore({
        profileId,
        username: parsed.data.displayName,
        bio: parsed.data.bio,
      });
    }
    const refreshed = await userProfileStore.getUser(parsed.data.wallet);
    if (refreshed) {
      profile = refreshed;
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("Tapestry profile creation failed", error);
  }
  return res.json({ user: profile });
});

router.get("/users/:wallet", async (req, res) => {
  const wallet = req.params.wallet;
  const cached = await userProfileStore.getUser(wallet);
  const profile = await fetchTapestryProfileByWallet(wallet, cached?.tapestryProfileId);
  if (profile) {
    const displayName =
      readCustomProperty(profile, "displayName") ??
      cached?.displayName ??
      profile.username;
    const bio =
      readCustomProperty(profile, "bio") ??
      cached?.bio ??
      profile.bio;
    const updated = await userProfileStore.upsertUser(wallet, {
      displayName: displayName ?? undefined,
      bio: bio ?? undefined,
      tapestryProfileId: profile.id,
    });
    return res.json({ user: updated });
  }
  if (cached) {
    return res.json({ user: cached });
  }
  return res.status(404).json({ error: "user not found" });
});

const updateUserSchema = z.object({
  displayName: z.string().optional(),
  bio: z.string().optional(),
});

router.patch("/users/:wallet", async (req, res) => {
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  if (parsed.data.displayName === undefined && parsed.data.bio === undefined) {
    return res.status(400).json({ error: "no profile updates provided" });
  }
  const wallet = req.params.wallet;
  const cached = await userProfileStore.getUser(wallet);
  let profileId = cached?.tapestryProfileId;

  if (!profileId) {
    const entry = await fetchTapestryProfileByWallet(wallet);
    profileId = entry?.id;
  }

  if (!profileId) {
    profileId = await socialServiceInstance.ensureProfile(wallet, parsed.data.displayName ?? cached?.displayName);
  }

  if (!profileId) {
    return res.status(500).json({ error: "unable to resolve tapestry profile" });
  }

  if (parsed.data.displayName === undefined && parsed.data.bio === undefined) {
    return res.status(400).json({ error: "no profile updates provided" });
  }

  try {
    await tapestryClient.updateProfileCore({
      profileId,
      username: parsed.data.displayName,
      bio: parsed.data.bio,
    });
  } catch (error: any) {
    return res.status(500).json({ error: error?.message ?? "tapestry profile update failed" });
  }

  const updated = await userProfileStore.upsertUser(wallet, {
    displayName: parsed.data.displayName ?? cached?.displayName,
    bio: parsed.data.bio ?? cached?.bio,
    tapestryProfileId: profileId,
  });
  return res.json({ user: updated });
});

async function ensureActiveSubscription(ownerWallet: string, streamId: string): Promise<void> {
  if (!onChainSubscriptionClient || !streamRegistry) {
    throw new Error("on-chain subscription client not configured");
  }
  const streamPda = streamRegistry.deriveStreamPda(streamId).toBase58();
  const subs = await onChainSubscriptionClient.listSubscriptionsFor(ownerWallet);
  const now = Date.now();
  const match = subs.find(
    (sub) => sub.stream === streamPda && sub.status === 0 && (!sub.expiresAt || sub.expiresAt > now)
  );
  if (!match) {
    throw new Error("active subscription required");
  }
}

async function ensureAnyActiveSubscription(ownerWallet: string): Promise<void> {
  if (!onChainSubscriptionClient) {
    throw new Error("on-chain subscription client not configured");
  }
  const subs = await onChainSubscriptionClient.listSubscriptionsFor(ownerWallet);
  const now = Date.now();
  const match = subs.find((sub) => sub.status === 0 && (!sub.expiresAt || sub.expiresAt > now));
  if (!match) {
    throw new Error("active subscription required to register an agent");
  }
}

async function fetchSubscriptionKey(ownerWallet: PublicKey, streamId: string): Promise<Uint8Array | null> {
  if (!streamRegistry) {
    throw new Error("stream registry not configured");
  }
  const subscriptionProgramId = process.env.SOLANA_SUBSCRIPTION_PROGRAM_ID;
  const rpcUrl = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
  if (!subscriptionProgramId) {
    throw new Error("subscription program not configured");
  }
  const programId = new PublicKey(subscriptionProgramId);
  const connection = new Connection(rpcUrl, "confirmed");
  const streamPda = streamRegistry.deriveStreamPda(streamId);
  const walletKeyPda = PublicKey.findProgramAddressSync(
    [Buffer.from("sub_key"), streamPda.toBuffer(), ownerWallet.toBuffer()],
    programId
  )[0];
  const walletKeyAccount = await connection.getAccountInfo(walletKeyPda);
  if (!walletKeyAccount) {
    return null;
  }
  const decodedKey = decodeSubscriptionKey(walletKeyAccount.data);
  return decodedKey?.encPubkey ?? null;
}

async function ensureSubscriptionKeyRegistered(ownerWallet: string, streamId: string): Promise<void> {
  const walletPubkey = new PublicKey(ownerWallet);
  const onchainEncPub = await fetchSubscriptionKey(walletPubkey, streamId);
  if (!onchainEncPub) {
    throw new Error("subscription encryption key not registered");
  }
}

const agentSchema = z.object({
  ownerWallet: z.string(),
  agentPubkey: z.string().optional(),
  name: z.string(),
  role: z.enum(["maker", "listener", "both"]).default("maker"),
  streamId: z.string().optional(),
  domain: z.string(),
  description: z.string().optional(),
  evidence: z.enum(["trust", "verifier", "hybrid"]).default("trust"),
  tiers: z
    .array(
      z.object({
        tierId: z.string(),
        pricingType: z.literal("subscription_unlimited"),
        price: z.string(),
        quota: z.string().optional(),
        evidenceLevel: z.enum(["trust", "verifier"]),
      })
    )
    .optional(),
});

router.post("/agents", async (req, res) => {
  const parsed = agentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const isSender = parsed.data.role === "maker" || parsed.data.role === "both";
  if (isSender && !parsed.data.streamId) {
    return res.status(400).json({ error: "streamId is required for sender agents" });
  }
  if (isSender && parsed.data.streamId) {
    const existingMakers = await agentProfileStore.listAgents({
      role: "maker",
      streamId: parsed.data.streamId,
    });
    const existingBoth = await agentProfileStore.listAgents({
      role: "both",
      streamId: parsed.data.streamId,
    });
    if (existingMakers.length > 0 || existingBoth.length > 0) {
      return res.status(409).json({ error: "sender agent already exists for stream" });
    }
  }
  const agent = await agentProfileStore.createAgent(parsed.data);
  return res.json({ agent });
});

router.get("/agents", async (req, res) => {
  const owner = typeof req.query.owner === "string" ? req.query.owner : undefined;
  const role = typeof req.query.role === "string" ? (req.query.role as "maker" | "listener" | "both") : undefined;
  const streamId = typeof req.query.streamId === "string" ? req.query.streamId : undefined;
  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  const agents = await agentProfileStore.listAgents({ ownerWallet: owner, role, streamId, search });
  return res.json({ agents });
});

router.get("/agents/:id", async (req, res) => {
  const agent = await agentProfileStore.getAgent(req.params.id);
  if (!agent) {
    return res.status(404).json({ error: "agent not found" });
  }
  return res.json({ agent });
});

const agentSubscriptionSchema = z.object({
  ownerWallet: z.string(),
  agentId: z.string(),
  streamId: z.string(),
  tierId: z.string(),
  pricingType: z.literal("subscription_unlimited"),
  evidenceLevel: z.enum(["trust", "verifier"]),
  visibility: z.enum(["public", "private"]).optional(),
  onchainTx: z.string().optional(),
});

router.post("/agent-subscriptions", async (req, res) => {
  const parsed = agentSubscriptionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const agent = await agentProfileStore.getAgent(parsed.data.agentId);
  if (!agent) {
    return res.status(404).json({ error: "agent not found" });
  }
  if (agent.ownerWallet !== parsed.data.ownerWallet) {
    return res.status(403).json({ error: "agent owner mismatch" });
  }
  try {
    await ensureActiveSubscription(parsed.data.ownerWallet, parsed.data.streamId);
  } catch (error: any) {
    const message = error?.message ?? "active subscription required";
    const status = message.includes("not configured") ? 503 : 403;
    return res.status(status).json({ error: message });
  }
  try {
    if (!streamRegistry) {
      throw new Error("stream registry not configured");
    }
    const config = await streamRegistry.getStreamConfig(parsed.data.streamId);
    if (!config) {
      return res.status(404).json({ error: "stream not found" });
    }
    const visibility = config.visibility === 0 ? "public" : "private";
    if (visibility === "private") {
      await ensureSubscriptionKeyRegistered(parsed.data.ownerWallet, parsed.data.streamId);
    }
  } catch (error: any) {
    const message = error?.message ?? "subscription encryption key not registered";
    const status = message.includes("not configured") ? 503 : 403;
    return res.status(status).json({ error: message });
  }
  const existing = await agentSubscriptionProfileStore.listAgentSubscriptions({
    ownerWallet: parsed.data.ownerWallet,
    agentId: parsed.data.agentId,
    streamId: parsed.data.streamId,
  });
  if (existing.length > 0) {
    return res.status(409).json({ error: "subscription already linked to agent" });
  }
  const record = await agentSubscriptionProfileStore.createAgentSubscription(parsed.data);
  return res.json({ agentSubscription: record });
});

router.get("/agent-subscriptions", async (req, res) => {
  const owner = typeof req.query.owner === "string" ? req.query.owner : undefined;
  const agentId = typeof req.query.agentId === "string" ? req.query.agentId : undefined;
  const streamId = typeof req.query.streamId === "string" ? req.query.streamId : undefined;
  const subscriptions = await agentSubscriptionProfileStore.listAgentSubscriptions({
    ownerWallet: owner,
    agentId,
    streamId,
  });
  return res.json({ agentSubscriptions: subscriptions });
});

router.delete("/agent-subscriptions/:id", async (req, res) => {
  const removed = await agentSubscriptionProfileStore.deleteAgentSubscription(req.params.id);
  if (!removed) {
    return res.status(404).json({ error: "agent subscription not found" });
  }
  return res.json({ ok: true });
});

const intentSchema = z.object({
  wallet: z.string(),
  content: z.string(),
  streamId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  topic: z.string().optional(),
  displayName: z.string().optional(),
});

router.post("/social/intents", async (req, res) => {
  const parsed = intentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  try {
    const post = await socialServiceInstance.createIntent(parsed.data);
    return res.json({ post });
  } catch (error: any) {
    return res.status(500).json({ error: error.message ?? "intent post failed" });
  }
});

const slashSchema = z.object({
  wallet: z.string(),
  content: z.string(),
  streamId: z.string().trim().min(1, "streamId is required"),
  makerWallet: z.string().optional(),
  challengeTx: z.string().trim().min(1, "challengeTx is required"),
  severity: z.string().optional(),
  displayName: z.string().optional(),
});

router.post("/social/slash", async (req, res) => {
  const parsed = slashSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  try {
    const post = await socialServiceInstance.createSlashReport(parsed.data);
    return res.json({ post });
  } catch (error: any) {
    return res.status(500).json({ error: error.message ?? "slash post failed" });
  }
});

router.get("/social/feed", async (req, res) => {
  const type = typeof req.query.type === "string" ? req.query.type : undefined;
  const scope = typeof req.query.scope === "string" ? req.query.scope : undefined;
  const wallet = typeof req.query.wallet === "string" ? req.query.wallet : undefined;
  const page = typeof req.query.page === "string" ? Number(req.query.page) : undefined;
  const pageSize = typeof req.query.pageSize === "string" ? Number(req.query.pageSize) : undefined;
  if (scope === "following") {
    if (!wallet) {
      return res.status(400).json({ error: "wallet required for following feed" });
    }
    try {
      const result = await socialServiceInstance.listFollowingPosts({
        wallet,
        type: type as any,
        page,
        pageSize,
      });
      return res.json(result);
    } catch (error: any) {
      return res.status(500).json({ error: error.message ?? "following feed failed" });
    }
  }
  try {
    const result = await socialServiceInstance.listPostsWithCounts(type as any, pageSize ?? 50);
    return res.json(result);
  } catch (error: any) {
    return res.status(503).json({ error: error.message ?? "social feed unavailable" });
  }
});

const likeSchema = z.object({
  wallet: z.string(),
  contentId: z.string(),
  displayName: z.string().optional(),
});

router.post("/social/likes", async (req, res) => {
  const parsed = likeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  try {
    const result = await socialServiceInstance.like(
      parsed.data.wallet,
      parsed.data.contentId,
      parsed.data.displayName
    );
    return res.json({ result });
  } catch (error: any) {
    return res.status(500).json({ error: error.message ?? "like failed" });
  }
});

router.delete("/social/likes", async (req, res) => {
  const parsed = likeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  try {
    const result = await socialServiceInstance.unlike(
      parsed.data.wallet,
      parsed.data.contentId,
      parsed.data.displayName
    );
    return res.json({ result });
  } catch (error: any) {
    return res.status(500).json({ error: error.message ?? "unlike failed" });
  }
});

router.get("/social/likes", async (req, res) => {
  const contentId = typeof req.query.contentId === "string" ? req.query.contentId : undefined;
  if (!contentId) {
    return res.status(400).json({ error: "contentId required" });
  }
  try {
    const count = await socialServiceInstance.getLikes(contentId);
    return res.json({ count });
  } catch (error: any) {
    return res.status(500).json({ error: error.message ?? "likes lookup failed" });
  }
});

const commentSchema = z.object({
  wallet: z.string(),
  contentId: z.string(),
  comment: z.string(),
  displayName: z.string().optional(),
});

const deleteCommentSchema = z.object({
  wallet: z.string(),
  displayName: z.string().optional(),
});

const deletePostSchema = z.object({
  wallet: z.string(),
  displayName: z.string().optional(),
});

const followSchema = z.object({
  wallet: z.string(),
  targetProfileId: z.string(),
  displayName: z.string().optional(),
});

router.post("/social/comments", async (req, res) => {
  const parsed = commentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  try {
    const result = await socialServiceInstance.addComment(
      parsed.data.wallet,
      parsed.data.contentId,
      parsed.data.comment,
      parsed.data.displayName
    );
    return res.json({ result });
  } catch (error: any) {
    return res.status(500).json({ error: error.message ?? "comment failed" });
  }
});

router.delete("/social/comments/:id", async (req, res) => {
  const parsed = deleteCommentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const commentId = req.params.id;
  if (!commentId) {
    return res.status(400).json({ error: "commentId required" });
  }
  try {
    await socialServiceInstance.deleteComment(parsed.data.wallet, commentId, parsed.data.displayName);
    return res.json({ ok: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message ?? "comment delete failed" });
  }
});

router.get("/social/comments", async (req, res) => {
  const contentId = typeof req.query.contentId === "string" ? req.query.contentId : undefined;
  if (!contentId) {
    return res.status(400).json({ error: "contentId required" });
  }
  const page = typeof req.query.page === "string" ? Number(req.query.page) : undefined;
  const pageSize = typeof req.query.pageSize === "string" ? Number(req.query.pageSize) : undefined;
  try {
    const raw = await socialServiceInstance.getComments(contentId);
    const comments = extractList(raw, "comments");
    if (page && pageSize) {
      const safePage = Math.max(1, page);
      const safeSize = Math.max(1, pageSize);
      const start = (safePage - 1) * safeSize;
      const paged = comments.slice(start, start + safeSize);
      return res.json({ comments: paged, page: safePage, pageSize: safeSize, total: comments.length });
    }
    return res.json({ comments, total: comments.length });
  } catch (error: any) {
    return res.status(500).json({ error: error.message ?? "comments lookup failed" });
  }
});

router.get("/social/follow-counts", async (req, res) => {
  const wallet = typeof req.query.wallet === "string" ? req.query.wallet : undefined;
  if (!wallet) {
    return res.status(400).json({ error: "wallet required" });
  }
  try {
    const counts = await socialServiceInstance.getFollowCountsByWallet(wallet);
    return res.json({ counts });
  } catch (error: any) {
    return res.status(500).json({ error: error.message ?? "follow counts failed" });
  }
});

router.get("/social/following-ids", async (req, res) => {
  const wallet = typeof req.query.wallet === "string" ? req.query.wallet : undefined;
  if (!wallet) {
    return res.status(400).json({ error: "wallet required" });
  }
  try {
    const following = await socialServiceInstance.listFollowingIds(wallet);
    return res.json({ following });
  } catch (error: any) {
    return res.status(500).json({ error: error.message ?? "following list failed" });
  }
});

router.delete("/social/posts/:id", async (req, res) => {
  const parsed = deletePostSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const contentId = req.params.id;
  if (!contentId) {
    return res.status(400).json({ error: "contentId required" });
  }
  try {
    await socialServiceInstance.deletePost(parsed.data.wallet, contentId, parsed.data.displayName);
    return res.json({ ok: true });
  } catch (error: any) {
    return res.status(500).json({ error: error.message ?? "post delete failed" });
  }
});

router.post("/social/follow", async (req, res) => {
  const parsed = followSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  try {
    const result = await socialServiceInstance.follow(
      parsed.data.wallet,
      parsed.data.targetProfileId,
      parsed.data.displayName
    );
    return res.json({ result });
  } catch (error: any) {
    return res.status(500).json({ error: error.message ?? "follow failed" });
  }
});

router.get("/social/posts/:id", async (req, res) => {
  const contentId = req.params.id;
  try {
    const post = await socialServiceInstance.getPost(contentId);
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }
    const likes = await socialServiceInstance.getLikes(contentId);
    return res.json({ post, likeCount: likes });
  } catch (error: any) {
    return res.status(500).json({ error: error.message ?? "Failed to fetch post" });
  }
});

router.get("/social/feed/trending", async (req, res) => {
  const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
  try {
    const { posts, likeCounts, commentCounts } = await socialServiceInstance.listPostsWithCounts(undefined, limit ?? 50);
    const sorted = [...posts].sort((a, b) => {
      const aLikes = likeCounts[a.contentId] ?? 0;
      const bLikes = likeCounts[b.contentId] ?? 0;
      if (bLikes !== aLikes) return bLikes - aLikes;
      return b.createdAt - a.createdAt;
    });
    const trimmed = limit ? sorted.slice(0, Math.max(limit, 0)) : sorted;
    return res.json({ posts: trimmed, likeCounts, commentCounts });
  } catch (error: any) {
    return res.status(503).json({ error: error.message ?? "trending feed unavailable" });
  }
});

function extractList(raw: any, fallbackKey: "likes" | "comments") {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.data)) return raw.data;
  if (Array.isArray(raw?.data?.[fallbackKey])) return raw.data[fallbackKey];
  if (Array.isArray(raw?.[fallbackKey])) return raw[fallbackKey];
  return [];
}

function decodeWalletKey(data: Buffer): { encPubkey: Uint8Array } | null {
  if (data.length < 81) {
    return null;
  }
  let offset = 8;
  offset += 32; // subscriber
  const encPubkey = data.subarray(offset, offset + 32);
  return { encPubkey };
}

function decodeSubscriptionKey(data: Buffer): { encPubkey: Uint8Array } | null {
  if (data.length < 113) {
    return null;
  }
  let offset = 8;
  offset += 32; // subscriber
  offset += 32; // stream
  const encPubkey = data.subarray(offset, offset + 32);
  return { encPubkey };
}

function decodeSubscriberKey(data: Buffer): { encPubkey: Uint8Array } | null {
  if (data.length < 145) {
    return null;
  }
  let offset = 8;
  offset += 32; // subscription
  offset += 32; // stream
  offset += 32; // subscriber
  const encPubkey = data.subarray(offset, offset + 32);
  return { encPubkey };
}

const X25519_SPKI_PREFIX = Buffer.from("302a300506032b656e032100", "hex");

function x25519RawToDer(raw: Uint8Array): Buffer {
  if (raw.length !== 32) {
    throw new Error("raw x25519 public key must be 32 bytes");
  }
  return Buffer.concat([X25519_SPKI_PREFIX, Buffer.from(raw)]);
}

function x25519DerToRaw(der: Buffer): Buffer {
  if (der.length === 32) {
    return der;
  }
  if (der.length === X25519_SPKI_PREFIX.length + 32 && der.subarray(0, X25519_SPKI_PREFIX.length).equals(X25519_SPKI_PREFIX)) {
    return der.subarray(X25519_SPKI_PREFIX.length);
  }
  throw new Error("invalid x25519 public key encoding");
}

function normalizeX25519PublicKey(base64: string): { raw: Buffer; der: Buffer } {
  const buf = Buffer.from(base64, "base64");
  const raw = x25519DerToRaw(buf);
  const der = buf.length === 32 ? x25519RawToDer(raw) : buf;
  return { raw, der };
}

function buildKeyboxMessage(sha: string): string {
  return `sigints:keybox:${sha}`;
}

function buildPublicMessage(sha: string): string {
  return `sigints:public:${sha}`;
}

async function assertActiveSubscriptionNft(walletPubkey: PublicKey, streamId: string) {
  if (!streamRegistry) {
    throw new Error("stream registry not configured");
  }
  const subscriptionProgramId = process.env.SOLANA_SUBSCRIPTION_PROGRAM_ID;
  const rpcUrl = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
  if (!subscriptionProgramId) {
    throw new Error("subscription program not configured");
  }
  const programId = new PublicKey(subscriptionProgramId);
  const streamPda = streamRegistry.deriveStreamPda(streamId);
  const [subscriptionPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("subscription"), streamPda.toBuffer(), walletPubkey.toBuffer()],
    programId
  );
  const connection = new Connection(rpcUrl, "confirmed");
  const subscriptionAccount = await connection.getAccountInfo(subscriptionPda);
  if (!subscriptionAccount) {
    throw new Error("active subscription required");
  }
  const decoded = decodeSubscriptionAccount(subscriptionPda, subscriptionAccount.data);
  if (!decoded) {
    throw new Error("invalid subscription account");
  }
  if (decoded.status !== 0) {
    throw new Error("subscription not active");
  }
  if (decoded.expiresAt && decoded.expiresAt <= Date.now()) {
    throw new Error("subscription expired");
  }

  const nftMint = new PublicKey(decoded.nftMint);
  const ata = getAssociatedTokenAddressSync(nftMint, walletPubkey, false, TOKEN_2022_PROGRAM_ID);
  try {
    const tokenAccount = await getAccount(connection, ata, "confirmed", TOKEN_2022_PROGRAM_ID);
    if (tokenAccount.amount !== 1n) {
      throw new Error("subscription NFT not held");
    }
  } catch {
    throw new Error("subscription NFT not held");
  }
}

function verifySignature(wallet: PublicKey, signatureBase64: string, message: string): boolean {
  try {
    const sig = Buffer.from(signatureBase64, "base64");
    const msg = Buffer.from(message, "utf8");
    return nacl.sign.detached.verify(msg, sig, wallet.toBytes());
  } catch {
    return false;
  }
}

async function getAccountWithRetry(
  connection: Connection,
  pubkey: PublicKey,
  timeoutMs = 15_000,
  intervalMs = 1_000
): Promise<ReturnType<Connection["getAccountInfo"]>> {
  const start = Date.now();
  let account = await connection.getAccountInfo(pubkey);
  while (!account && Date.now() - start < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    account = await connection.getAccountInfo(pubkey);
  }
  return account;
}

async function listSubscriptionsForStream(
  connection: Connection,
  programId: PublicKey,
  streamPubkey: PublicKey
): Promise<OnChainSubscription[]> {
  const filters = [
    { memcmp: { offset: 8 + 32, bytes: streamPubkey.toBase58() } },
  ];
  const programAccounts = await connection.getProgramAccounts(programId, { filters });
  return programAccounts
    .map((acc) => decodeSubscriptionAccount(acc.pubkey, acc.account.data))
    .filter((item): item is OnChainSubscription => item !== null);
}

async function listSubscriptionsForSubscriber(
  connection: Connection,
  programId: PublicKey,
  subscriber: string
): Promise<OnChainSubscription[]> {
  const subscriberPubkey = new PublicKey(subscriber);
  const filters = [
    { memcmp: { offset: 8, bytes: subscriberPubkey.toBase58() } },
  ];
  const programAccounts = await connection.getProgramAccounts(programId, { filters });
  return programAccounts
    .map((acc) => decodeSubscriptionAccount(acc.pubkey, acc.account.data))
    .filter((item): item is OnChainSubscription => item !== null);
}

async function resolveStreamSubscriberKeys(streamId: string): Promise<{ encPubKeyDerBase64: string }[]> {
  if (!streamRegistry) {
    throw new Error("stream registry not configured");
  }
  const subscriptionProgramId = process.env.SOLANA_SUBSCRIPTION_PROGRAM_ID;
  const rpcUrl = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
  if (!subscriptionProgramId) {
    throw new Error("subscription program not configured");
  }
  const programId = new PublicKey(subscriptionProgramId);
  const connection = new Connection(rpcUrl, "confirmed");
  const streamPda = streamRegistry.deriveStreamPda(streamId);
  const subscriptions = onChainSubscriptionClient
    ? await onChainSubscriptionClient.listSubscriptionsForStream(streamPda.toBase58())
    : await listSubscriptionsForStream(connection, programId, streamPda);

  const now = Date.now();
  const activeSubscribers = Array.from(
    new Set(
      subscriptions
        .filter((sub) => sub.status === 0 && (!sub.expiresAt || sub.expiresAt > now))
        .map((sub) => sub.subscriber)
    )
  );

  if (activeSubscribers.length === 0) {
    return [];
  }

  const subscriptionKeyPdas = activeSubscribers.map((subscriber) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("sub_key"), streamPda.toBuffer(), new PublicKey(subscriber).toBuffer()],
      programId
    )[0]
  );
  const subscriptionKeyAccounts = await connection.getMultipleAccountsInfo(subscriptionKeyPdas);
  const subscribers: { encPubKeyDerBase64: string }[] = [];
  subscriptionKeyAccounts.forEach((account) => {
    if (!account || !account.owner.equals(programId)) {
      return;
    }
    const decoded = decodeSubscriptionKey(account.data);
    if (!decoded) {
      return;
    }
    subscribers.push({
      encPubKeyDerBase64: x25519RawToDer(decoded.encPubkey).toString("base64"),
    });
  });
  return subscribers;
}

const subscribeSchema = z.object({
  streamId: z.string(),
  subscriberWallet: z.string(),
  // Test-only bypass field (ignored in production).
  encPubKeyDerBase64: z.string().optional(),
});

router.post("/subscribe", async (req, res) => {
  const parsed = subscribeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const stream = await discoveryService.getStream(parsed.data.streamId);
  if (!stream) {
    return res.status(404).json({ error: "stream not found" });
  }
  const visibility = stream.visibility ?? "private";
  if (
    parsed.data.encPubKeyDerBase64 &&
    !(process.env.NODE_ENV === "test" && process.env.TEST_ALLOW_SUBSCRIBE_BYPASS === "true")
  ) {
    return res.status(400).json({ error: "encPubKeyDerBase64 is test-only" });
  }
  if (process.env.NODE_ENV === "test" && process.env.TEST_ALLOW_SUBSCRIBE_BYPASS === "true") {
    if (!parsed.data.encPubKeyDerBase64) {
      return res.status(400).json({ error: "encPubKeyDerBase64 required for test bypass" });
    }
    const pub = Buffer.from(parsed.data.encPubKeyDerBase64, "base64");
    const subscriberId = subscriberIdFromPubkey(pub);
    return res.json({ subscriberId, bypass: true });
  }
  if (visibility === "public") {
    return res.json({ subscriberId: null, public: true });
  }
  if (!streamRegistry) {
    return res.status(503).json({ error: "stream registry not configured" });
  }
  const subscriptionProgramId = process.env.SOLANA_SUBSCRIPTION_PROGRAM_ID;
  const rpcUrl = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
  if (!subscriptionProgramId) {
    return res.status(503).json({ error: "subscription program not configured" });
  }
  try {
    const subscriberPubkey = new PublicKey(parsed.data.subscriberWallet);
    const streamPda = streamRegistry.deriveStreamPda(parsed.data.streamId);
    const [subscriptionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("subscription"), streamPda.toBuffer(), subscriberPubkey.toBuffer()],
      new PublicKey(subscriptionProgramId)
    );
    const connection = new Connection(rpcUrl, "confirmed");
    const subscriptionAccount = await getAccountWithRetry(
      connection,
      subscriptionPda,
      Number(process.env.SUBSCRIBE_WAIT_MS ?? 15_000),
      1_000
    );
    if (!subscriptionAccount) {
      return res.status(400).json({ error: "on-chain subscription not found" });
    }
    const [subKeyPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("sub_key"), streamPda.toBuffer(), subscriberPubkey.toBuffer()],
      new PublicKey(subscriptionProgramId)
    );
    const subKeyAccount = await connection.getAccountInfo(subKeyPda);
    if (!subKeyAccount) {
      return res.json({ subscriberId: null, needsKey: true });
    }
    const decoded = decodeSubscriptionKey(subKeyAccount.data);
    if (!decoded) {
      return res.json({ subscriberId: null, needsKey: true });
    }
    const encPubKeyBase64 = x25519RawToDer(decoded.encPubkey).toString("base64");
    const pubDer = Buffer.from(encPubKeyBase64, "base64");
    const subscriberId = subscriberIdFromPubkey(pubDer);
    return res.json({ subscriberId, needsKey: false });
  } catch (error: any) {
    return res.status(400).json({ error: error.message ?? "invalid subscriber wallet" });
  }
});

const subscriptionKeySyncSchema = z.object({
  wallet: z.string(),
  streamId: z.string(),
  encPubKeyDerBase64: z.string().optional(),
});

router.post("/subscription-key/sync", async (req, res) => {
  const parsed = subscriptionKeySyncSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const wallet = parsed.data.wallet;
  if (process.env.NODE_ENV === "test" && process.env.TEST_ALLOW_SUBSCRIBE_BYPASS === "true") {
    if (!parsed.data.encPubKeyDerBase64) {
      return res.status(400).json({ error: "encPubKeyDerBase64 required for test bypass" });
    }
    const pub = Buffer.from(parsed.data.encPubKeyDerBase64, "base64");
    const subscriberId = subscriberIdFromPubkey(pub);
    return res.json({ subscriberId, bypass: true });
  }
  const subscriptionProgramId = process.env.SOLANA_SUBSCRIPTION_PROGRAM_ID;
  const rpcUrl = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
  if (!subscriptionProgramId) {
    return res.status(503).json({ error: "subscription program not configured" });
  }
  if (!streamRegistry) {
    return res.status(503).json({ error: "stream registry not configured" });
  }

  const walletPubkey = new PublicKey(wallet);
  const streamPda = streamRegistry.deriveStreamPda(parsed.data.streamId);
  const connection = new Connection(rpcUrl, "confirmed");
  const [subKeyPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("sub_key"), streamPda.toBuffer(), walletPubkey.toBuffer()],
    new PublicKey(subscriptionProgramId)
  );
  const subKeyAccount = await connection.getAccountInfo(subKeyPda);
  if (!subKeyAccount) {
    return res.status(400).json({ error: "subscription encryption key not registered on-chain" });
  }
  const decoded = decodeSubscriptionKey(subKeyAccount.data);
  if (!decoded) {
    return res.status(400).json({ error: "subscription encryption key invalid" });
  }
  const encPubKeyDerBase64 = x25519RawToDer(decoded.encPubkey).toString("base64");
  const subscriberId = subscriberIdFromPubkey(Buffer.from(encPubKeyDerBase64, "base64"));

  return res.json({
    subscriberId,
    wallet,
    streamId: parsed.data.streamId,
    publicKey: encPubKeyDerBase64,
  });
});

const onchainSubscribeSchema = z.object({
  streamId: z.string(),
  tierId: z.string(),
  pricingType: z.union([z.literal("subscription_unlimited"), z.literal(1)]),
  evidenceLevel: z.union([z.enum(["trust", "verifier"]), z.number().int()]),
  priceLamports: z.number().int().nonnegative().optional(),
  expiresAt: z.number().optional(),
  quotaRemaining: z.number().int().optional(),
  subscriberPubkey: z.string().optional(),
  makerPubkey: z.string().optional(),
  treasuryPubkey: z.string().optional(),
});

router.post("/subscribe/onchain", async (req, res) => {
  if (!onChainSubscriptionClient) {
    return res.status(503).json({ error: "on-chain subscription not configured" });
  }
  const parsed = onchainSubscribeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  try {
    let payload = parsed.data;
    const stream = await discoveryService.getStream(payload.streamId);
    if (!stream) {
      return res.status(404).json({ error: "stream not found" });
    }
    const visibility = stream.visibility ?? "private";
    if (visibility === "private") {
      const subscriberPubkey = payload.subscriberPubkey
        ? new PublicKey(payload.subscriberPubkey)
        : undefined;
      if (!subscriberPubkey) {
        return res.status(400).json({ error: "subscriberPubkey required for private streams" });
      }
    }
    if (streamRegistry && (!payload.makerPubkey || !payload.treasuryPubkey)) {
      const config = await streamRegistry.getStreamConfig(payload.streamId);
      if (config) {
        payload = {
          ...payload,
          makerPubkey: payload.makerPubkey ?? config.authority,
          treasuryPubkey: payload.treasuryPubkey ?? config.dao,
        };
      }
    }
    const signature = await onChainSubscriptionClient.subscribe(payload);
    return res.json({ signature });
  } catch (error: any) {
    return res.status(500).json({ error: error.message ?? "on-chain subscribe failed" });
  }
});

router.get("/subscriptions/onchain", async (req, res) => {
  const subscriber = typeof req.query.subscriber === "string" ? req.query.subscriber : undefined;
  if (!subscriber) {
    return res.status(400).json({ error: "subscriber required" });
  }
  const subscriptionProgramId = process.env.SOLANA_SUBSCRIPTION_PROGRAM_ID;
  if (!subscriptionProgramId) {
    return res.status(503).json({ error: "on-chain subscription not configured" });
  }
  try {
    const subscriptions = onChainSubscriptionClient
      ? await onChainSubscriptionClient.listSubscriptionsFor(subscriber)
      : await listSubscriptionsForSubscriber(
          new Connection(process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com", "confirmed"),
          new PublicKey(subscriptionProgramId),
          subscriber
        );
    return res.json({ subscriptions });
  } catch (error: any) {
    return res.status(500).json({ error: error.message ?? "on-chain list failed" });
  }
});

const onchainRenewSchema = z.object({
  streamId: z.string(),
  expiresAt: z.number().optional(),
  quotaRemaining: z.number().int().optional(),
  subscriberPubkey: z.string().optional(),
});

router.post("/subscribe/onchain/renew", async (req, res) => {
  if (!onChainSubscriptionClient) {
    return res.status(503).json({ error: "on-chain subscription not configured" });
  }
  const parsed = onchainRenewSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  try {
    const signature = await onChainSubscriptionClient.renew(parsed.data);
    return res.json({ signature });
  } catch (error: any) {
    return res.status(500).json({ error: error.message ?? "on-chain renew failed" });
  }
});

const onchainCancelSchema = z.object({
  streamId: z.string(),
  subscriberPubkey: z.string().optional(),
});

router.post("/subscribe/onchain/cancel", async (req, res) => {
  if (!onChainSubscriptionClient) {
    return res.status(503).json({ error: "on-chain subscription not configured" });
  }
  const parsed = onchainCancelSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  try {
    const signature = await onChainSubscriptionClient.cancel(parsed.data);
    return res.json({ signature });
  } catch (error: any) {
    return res.status(500).json({ error: error.message ?? "on-chain cancel failed" });
  }
});

router.post("/keys", (_req, res) => {
  const kp = generateX25519Keypair();
  const pub = kp.publicKey.toString("base64");
  const priv = kp.privateKey.toString("base64");
  const subscriberId = subscriberIdFromPubkey(kp.publicKey);
  return res.json({ publicKeyBase64: pub, privateKeyBase64: priv, subscriberId });
});

// Decrypt endpoint removed; decryption should be client-side for MVP privacy.

export default router;

import { Router } from "express";
import { z } from "zod";
import { Connection, Keypair, PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import {
  getAccount,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import nacl from "tweetnacl";
import fs from "fs";
import path from "path";
import {
  signalService,
  metadataStore,
  subscriberDirectory,
  discoveryService,
  onChainSubscriptionClient,
  storageProvider,
  userProfileStore,
  botProfileStore,
  subscriptionProfileStore,
  socialServiceInstance,
  streamRegistry,
  tapestryStreamServiceInstance,
} from "./services/ServiceContainer";
import { decodeSubscriptionAccount } from "./services/OnChainSubscriptionClient";
import { subscriberIdFromPubkey, generateX25519Keypair } from "./crypto/hybrid";
import { hashTiersHex } from "./streams/tiersHash";

const router = Router();

const TEST_WALLET_ENABLED = process.env.TEST_WALLET === "true";
let cachedTestKeypair: Keypair | null = null;

function resolveTestWalletPath() {
  return (
    process.env.TEST_WALLET_PATH ??
    path.resolve(process.cwd(), "..", "accounts", "taker.json")
  );
}

function getTestWalletKeypair(): Keypair {
  if (cachedTestKeypair) {
    return cachedTestKeypair;
  }
  const keyPath = resolveTestWalletPath();
  const raw = fs.readFileSync(keyPath, "utf8");
  const parsed = JSON.parse(raw);
  const secret = Uint8Array.from(parsed);
  cachedTestKeypair = Keypair.fromSecretKey(secret);
  return cachedTestKeypair;
}

router.get("/health", (_req, res) => {
  return res.json({ ok: true, timestamp: Date.now() });
});

router.get("/test-wallet", (_req, res) => {
  if (!TEST_WALLET_ENABLED) {
    return res.status(404).json({ error: "test wallet disabled" });
  }
  try {
    const keypair = getTestWalletKeypair();
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
    const keypair = getTestWalletKeypair();
    const rpcUrl = process.env.SOLANA_RPC_URL ?? "http://127.0.0.1:8899";
    const connection = new Connection(rpcUrl, "confirmed");
    const raw = Buffer.from(parsed.data.transactionBase64, "base64");
    let signature: string;
    try {
      const vtx = VersionedTransaction.deserialize(raw);
      const { blockhash } = await connection.getLatestBlockhash("confirmed");
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
      const { blockhash } = await connection.getLatestBlockhash("confirmed");
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
    const keypair = getTestWalletKeypair();
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
  const visibility = parsed.data.visibility ?? "private";
  const subscribers =
    visibility === "public" ? [] : await subscriberDirectory.listSubscribers(parsed.data.streamId);
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
  const signals = await metadataStore.listSignals(streamId);
  return res.json({ signals });
});

router.get("/signals/latest", async (req, res) => {
  const streamId = req.query.streamId;
  if (!streamId || typeof streamId !== "string") {
    return res.status(400).json({ error: "streamId required" });
  }
  const signals = await metadataStore.listSignals(streamId);
  const latest = signals.sort((a, b) => b.createdAt - a.createdAt)[0];
  if (!latest) {
    return res.status(404).json({ error: "no signals" });
  }
  return res.json({ signal: latest });
});

router.get("/signals/by-hash/:hash", async (req, res) => {
  const hash = req.params.hash;
  const signals = await metadataStore.listAllSignals();
  const match = signals.find((s) => s.signalHash === hash);
  if (!match) {
    return res.status(404).json({ error: "signal not found" });
  }
  return res.json({ signal: match });
});

router.get("/storage/ciphertext/:sha", async (req, res) => {
  const sha = req.params.sha;
  try {
    const pointer = { id: `backend://ciphertext/${sha}`, sha256: sha };
    const bytes = await storageProvider.getCiphertext(pointer);
    const payload = JSON.parse(Buffer.from(bytes).toString("utf8"));
    return res.json({ payload });
  } catch (error: any) {
    return res.status(404).json({ error: error.message ?? "ciphertext not found" });
  }
});

router.get("/storage/public/:sha", async (req, res) => {
  const sha = req.params.sha;
  try {
    const pointer = { id: `backend://public/${sha}`, sha256: sha };
    const bytes = await storageProvider.getPublic(pointer);
    const payload = JSON.parse(Buffer.from(bytes).toString("utf8"));
    return res.json({ payload });
  } catch (error: any) {
    return res.status(404).json({ error: error.message ?? "public payload not found" });
  }
});

router.get("/storage/keybox/:sha", async (req, res) => {
  const sha = req.params.sha;
  const wallet = typeof req.query.wallet === "string" ? req.query.wallet : undefined;
  const signature = typeof req.query.signature === "string" ? req.query.signature : undefined;
  const providedEncPubKey =
    typeof req.query.encPubKeyDerBase64 === "string" ? req.query.encPubKeyDerBase64 : undefined;
  const subscriberId = typeof req.query.subscriberId === "string" ? req.query.subscriberId : undefined;
  try {
    if (
      process.env.NODE_ENV === "test" &&
      process.env.TEST_KEYBOX_BYPASS === "true"
    ) {
      const pointer = { id: `backend://keybox/${sha}`, sha256: sha };
      const bytes = await storageProvider.getKeybox(pointer);
      const parsed = JSON.parse(Buffer.from(bytes).toString("utf8")) as any;
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

    const signals = await metadataStore.listAllSignals();
    const meta = signals.find((signal) => signal.keyboxHash === sha);
    if (!meta) {
      return res.status(404).json({ error: "keybox not found" });
    }
    if ((meta.visibility ?? "private") === "public") {
      return res.status(400).json({ error: "public stream signals do not have a keybox" });
    }

    if (!wallet || !signature) {
      return res.status(401).json({ error: "wallet + signature required" });
    }
    if (!streamRegistry) {
      return res.status(503).json({ error: "stream registry not configured" });
    }
    const message = buildKeyboxMessage(sha);
    const walletPubkey = new PublicKey(wallet);
    if (!verifySignature(walletPubkey, signature, message)) {
      return res.status(401).json({ error: "invalid signature" });
    }

    const subscriptionProgramId = process.env.SOLANA_SUBSCRIPTION_PROGRAM_ID;
    const rpcUrl = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
    if (!subscriptionProgramId) {
      return res.status(503).json({ error: "subscription program not configured" });
    }
    const streamPda = streamRegistry.deriveStreamPda(meta.streamId);
    const [subscriptionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("subscription"), streamPda.toBuffer(), walletPubkey.toBuffer()],
      new PublicKey(subscriptionProgramId)
    );
    const connection = new Connection(rpcUrl, "confirmed");
    const subscriptionAccount = await connection.getAccountInfo(subscriptionPda);
    if (!subscriptionAccount) {
      return res.status(403).json({ error: "active subscription required" });
    }
    const decoded = decodeSubscriptionAccount(subscriptionPda, subscriptionAccount.data);
    if (!decoded) {
      return res.status(400).json({ error: "invalid subscription account" });
    }
    if (decoded.status !== 0) {
      return res.status(403).json({ error: "subscription not active" });
    }
    if (decoded.expiresAt && decoded.expiresAt <= Date.now()) {
      return res.status(403).json({ error: "subscription expired" });
    }

    const nftMint = new PublicKey(decoded.nftMint);
    const ata = getAssociatedTokenAddressSync(nftMint, walletPubkey, false, TOKEN_2022_PROGRAM_ID);
    try {
      const tokenAccount = await getAccount(connection, ata, "confirmed", TOKEN_2022_PROGRAM_ID);
      if (tokenAccount.amount !== 1n) {
        return res.status(403).json({ error: "subscription NFT not held" });
      }
    } catch {
      return res.status(403).json({ error: "subscription NFT not held" });
    }

    const subscriptionKeyPda = PublicKey.findProgramAddressSync(
      [Buffer.from("subscriber_key"), subscriptionPda.toBuffer()],
      new PublicKey(subscriptionProgramId)
    )[0];
    const walletKeyPda = PublicKey.findProgramAddressSync(
      [Buffer.from("wallet_key"), walletPubkey.toBuffer()],
      new PublicKey(subscriptionProgramId)
    )[0];
    let onchainEncPub: Uint8Array | null = null;
    const subscriptionKeyAccount = await connection.getAccountInfo(subscriptionKeyPda);
    if (subscriptionKeyAccount) {
      const decodedKey = decodeSubscriberKey(subscriptionKeyAccount.data);
      if (decodedKey) {
        onchainEncPub = decodedKey.encPubkey;
      }
    }
    if (!onchainEncPub) {
      const walletKeyAccount = await connection.getAccountInfo(walletKeyPda);
      if (walletKeyAccount) {
        const decodedKey = decodeWalletKey(walletKeyAccount.data);
        if (decodedKey) {
          onchainEncPub = decodedKey.encPubkey;
        }
      }
    }
    if (!onchainEncPub) {
      return res.status(403).json({ error: "encryption key not registered" });
    }
    if (providedEncPubKey) {
      const provided = Buffer.from(providedEncPubKey, "base64");
      if (provided.length !== 32 || !Buffer.from(onchainEncPub).equals(provided)) {
        return res.status(403).json({ error: "encryption key mismatch" });
      }
    }
    const subscriberIdFinal = subscriberIdFromPubkey(Buffer.from(onchainEncPub));

    const pointer = { id: `backend://keybox/${sha}`, sha256: sha };
    const bytes = await storageProvider.getKeybox(pointer);
    const parsed = JSON.parse(Buffer.from(bytes).toString("utf8")) as any;
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
  const signals = await metadataStore.listAllSignals();
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
  accuracy: z.string(),
  latency: z.string(),
  price: z.string(),
  evidence: z.string(),
  ownerWallet: z.string(),
  tiers: z.array(tierSchema).min(1),
});

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
        accuracy: parsed.data.accuracy,
        latency: parsed.data.latency,
        price: parsed.data.price,
        evidence: parsed.data.evidence,
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
    await socialServiceInstance.ensureProfile(parsed.data.wallet, parsed.data.displayName);
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
  const user = await userProfileStore.getUser(req.params.wallet);
  if (!user) {
    return res.status(404).json({ error: "user not found" });
  }
  return res.json({ user });
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
  const user = await userProfileStore.updateUser(req.params.wallet, parsed.data);
  if (!user) {
    return res.status(404).json({ error: "user not found" });
  }
  return res.json({ user });
});

const botSchema = z.object({
  ownerWallet: z.string(),
  name: z.string(),
  role: z.enum(["maker", "listener"]).default("maker"),
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

router.post("/bots", async (req, res) => {
  const parsed = botSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const bot = await botProfileStore.createBot(parsed.data);
  return res.json({ bot });
});

router.get("/bots", async (req, res) => {
  const owner = typeof req.query.owner === "string" ? req.query.owner : undefined;
  const role = typeof req.query.role === "string" ? (req.query.role as "maker" | "listener") : undefined;
  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  const bots = await botProfileStore.listBots({ ownerWallet: owner, role, search });
  return res.json({ bots });
});

router.get("/bots/:id", async (req, res) => {
  const bot = await botProfileStore.getBot(req.params.id);
  if (!bot) {
    return res.status(404).json({ error: "bot not found" });
  }
  return res.json({ bot });
});

const subscriptionSchema = z.object({
  listenerWallet: z.string(),
  botId: z.string(),
  tierId: z.string(),
  pricingType: z.literal("subscription_unlimited"),
  evidenceLevel: z.string(),
  onchainTx: z.string().optional(),
});

router.post("/subscriptions", async (req, res) => {
  const parsed = subscriptionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const record = await subscriptionProfileStore.createSubscription(parsed.data);
  return res.json({ subscription: record });
});

router.get("/subscriptions", async (req, res) => {
  const listener = typeof req.query.listener === "string" ? req.query.listener : undefined;
  const botId = typeof req.query.botId === "string" ? req.query.botId : undefined;
  const subscriptions = await subscriptionProfileStore.listSubscriptions({
    listenerWallet: listener,
    botId,
  });
  return res.json({ subscriptions });
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
  streamId: z.string().optional(),
  makerWallet: z.string().optional(),
  challengeTx: z.string().optional(),
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

function buildKeyboxMessage(sha: string): string {
  return `sigints:keybox:${sha}`;
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

const subscribeSchema = z.object({
  streamId: z.string(),
  encPubKeyDerBase64: z.string().optional(),
  subscriberWallet: z.string(),
});

router.post("/subscribe", async (req, res) => {
  const parsed = subscribeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  if (process.env.NODE_ENV === "test" && process.env.TEST_ALLOW_SUBSCRIBE_BYPASS === "true") {
    if (!parsed.data.encPubKeyDerBase64) {
      return res.status(400).json({ error: "encPubKeyDerBase64 required for test bypass" });
    }
    const pub = Buffer.from(parsed.data.encPubKeyDerBase64, "base64");
    const subscriberId = subscriberIdFromPubkey(pub);
    await subscriberDirectory.addSubscriber({
      streamId: parsed.data.streamId,
      subscriberId,
      encPubKeyDerBase64: parsed.data.encPubKeyDerBase64,
    });
    return res.json({ subscriberId, bypass: true });
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
    const subscriptionAccount = await connection.getAccountInfo(subscriptionPda);
    if (!subscriptionAccount) {
      return res.status(400).json({ error: "on-chain subscription not found" });
    }
    let encPubKeyBase64 = parsed.data.encPubKeyDerBase64;
    if (!encPubKeyBase64) {
      const [walletKeyPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("wallet_key"), subscriberPubkey.toBuffer()],
        new PublicKey(subscriptionProgramId)
      );
      const walletKeyAccount = await connection.getAccountInfo(walletKeyPda);
      if (!walletKeyAccount) {
        return res.status(400).json({ error: "wallet encryption key not registered on-chain" });
      }
      const decoded = decodeWalletKey(walletKeyAccount.data);
      if (!decoded) {
        return res.status(400).json({ error: "wallet encryption key invalid" });
      }
      encPubKeyBase64 = Buffer.from(decoded.encPubkey).toString("base64");
    }
    const pub = Buffer.from(encPubKeyBase64, "base64");
    const subscriberId = subscriberIdFromPubkey(pub);
    await subscriberDirectory.addSubscriber({
      streamId: parsed.data.streamId,
      subscriberId,
      encPubKeyDerBase64: encPubKeyBase64,
    });
    return res.json({ subscriberId });
  } catch (error: any) {
    return res.status(400).json({ error: error.message ?? "invalid subscriber wallet" });
  }
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
  if (!onChainSubscriptionClient) {
    return res.status(503).json({ error: "on-chain subscription not configured" });
  }
  const subscriber = typeof req.query.subscriber === "string" ? req.query.subscriber : undefined;
  if (!subscriber) {
    return res.status(400).json({ error: "subscriber required" });
  }
  try {
    const subscriptions = await onChainSubscriptionClient.listSubscriptionsFor(subscriber);
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

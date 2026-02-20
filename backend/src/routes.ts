import { Router } from "express";
import { z } from "zod";
import { Connection, PublicKey } from "@solana/web3.js";
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
  personaStore,
  personaRegistry,
  tapestryPersonaServiceInstance,
} from "./services/ServiceContainer";
import { subscriberIdFromPubkey, generateX25519Keypair } from "./crypto/hybrid";
import { hashTiersHex } from "./personas/tiersHash";

const router = Router();

router.get("/health", (_req, res) => {
  return res.json({ ok: true, timestamp: Date.now() });
});

const storeSchema = z.object({
  payloadBase64: z.string(),
  sha256: z.string().length(64),
});

const signalSchema = z.object({
  personaId: z.string(),
  tierId: z.string(),
  plaintextBase64: z.string(),
});

router.post("/signals", async (req, res) => {
  const parsed = signalSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const subscribers = await subscriberDirectory.listSubscribers(parsed.data.personaId);
  const publish = await signalService.publishSignal(
    parsed.data.personaId,
    parsed.data.tierId,
    Buffer.from(parsed.data.plaintextBase64, "base64"),
    subscribers.map((s) => ({ encPubKeyDerBase64: s.encPubKeyDerBase64 }))
  );
  return res.json({ metadata: publish.metadata });
});

router.get("/signals", async (req, res) => {
  const personaId = req.query.personaId;
  if (!personaId || typeof personaId !== "string") {
    return res.status(400).json({ error: "personaId required" });
  }
  const signals = await metadataStore.listSignals(personaId);
  return res.json({ signals });
});

router.get("/signals/latest", async (req, res) => {
  const personaId = req.query.personaId;
  if (!personaId || typeof personaId !== "string") {
    return res.status(400).json({ error: "personaId required" });
  }
  const signals = await metadataStore.listSignals(personaId);
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

router.get("/storage/keybox/:sha", async (req, res) => {
  const sha = req.params.sha;
  const subscriberId = typeof req.query.subscriberId === "string" ? req.query.subscriberId : undefined;
  try {
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
  } catch (error: any) {
    return res.status(404).json({ error: error.message ?? "keybox not found" });
  }
});

router.get("/feed", async (_req, res) => {
  const signals = await metadataStore.listAllSignals();
  const feed = [];
  const recent = signals.sort((a, b) => b.createdAt - a.createdAt).slice(0, 50);
  for (const signal of recent) {
    const persona = await discoveryService.getPersona(signal.personaId);
    feed.push({
      id: signal.signalHash,
      type: "signal",
      personaId: signal.personaId,
      personaName: persona?.name ?? signal.personaId,
      tierId: signal.tierId,
      createdAt: signal.createdAt,
      onchainTx: signal.onchainTx,
    });
  }
  return res.json({ feed });
});

router.get("/personas", async (req, res) => {
  const includeTiers =
    req.query.includeTiers === "true" || req.query.includeTiers === "1";
  if (includeTiers) {
    const personas = await discoveryService.listPersonaDetails();
    return res.json({ personas });
  }
  const personas = await discoveryService.listPersonas();
  return res.json({ personas });
});

router.get("/personas/:id", async (req, res) => {
  const persona = await discoveryService.getPersona(req.params.id);
  if (!persona) {
    return res.status(404).json({ error: "persona not found" });
  }
  return res.json({ persona });
});

const tierSchema = z.object({
  tierId: z.string(),
  pricingType: z.enum(["subscription_limited", "subscription_unlimited", "per_signal"]),
  price: z.string(),
  quota: z.string().optional(),
  evidenceLevel: z.enum(["trust", "verifier"]),
});

const personaSchema = z.object({
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

router.post("/personas", async (req, res) => {
  if (!personaRegistry) {
    return res.status(503).json({ error: "persona registry not configured" });
  }
  const parsed = personaSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const tiersHash = hashTiersHex(parsed.data.tiers);
  const onchain = await personaRegistry.getPersonaConfig(parsed.data.id);
  if (!onchain) {
    return res.status(400).json({ error: "persona not registered on-chain" });
  }
  if (onchain.status !== 1) {
    return res.status(400).json({ error: "persona is not active" });
  }
  if (onchain.authority !== parsed.data.ownerWallet) {
    return res.status(403).json({ error: "wallet is not persona authority" });
  }
  if (onchain.tiersHashHex !== tiersHash) {
    return res.status(400).json({ error: "tiers hash mismatch with on-chain" });
  }
  let tapestryProfileId: string | undefined;
  if (tapestryPersonaServiceInstance) {
    try {
      tapestryProfileId = await tapestryPersonaServiceInstance.upsertPersona(
        {
          personaId: parsed.data.id,
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
      return res.status(500).json({ error: error.message ?? "Tapestry persona sync failed" });
    }
  }
  const stored = await personaStore.upsertPersona({
    ...parsed.data,
    ...(tapestryProfileId ? { tapestryProfileId } : {}),
  });
  return res.json({
    persona: {
      ...stored,
      onchainAddress: onchain.pda,
      tapestryProfileId: tapestryProfileId ?? stored.tapestryProfileId,
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
  if (socialServiceInstance) {
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
        pricingType: z.enum(["subscription_limited", "subscription_unlimited", "per_signal"]),
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
  pricingType: z.string(),
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

function requireSocial(res: any) {
  if (!socialServiceInstance) {
    res.status(501).json({ error: "Tapestry not configured" });
    return false;
  }
  return true;
}

const intentSchema = z.object({
  wallet: z.string(),
  content: z.string(),
  personaId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  topic: z.string().optional(),
  displayName: z.string().optional(),
});

router.post("/social/intents", async (req, res) => {
  if (!requireSocial(res)) return;
  const parsed = intentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  try {
    const post = await socialServiceInstance!.createIntent(parsed.data);
    return res.json({ post });
  } catch (error: any) {
    return res.status(500).json({ error: error.message ?? "intent post failed" });
  }
});

const slashSchema = z.object({
  wallet: z.string(),
  content: z.string(),
  personaId: z.string().optional(),
  makerWallet: z.string().optional(),
  challengeTx: z.string().optional(),
  severity: z.string().optional(),
  displayName: z.string().optional(),
});

router.post("/social/slash", async (req, res) => {
  if (!requireSocial(res)) return;
  const parsed = slashSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  try {
    const post = await socialServiceInstance!.createSlashReport(parsed.data);
    return res.json({ post });
  } catch (error: any) {
    return res.status(500).json({ error: error.message ?? "slash post failed" });
  }
});

router.get("/social/feed", async (req, res) => {
  if (!requireSocial(res)) return;
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
      const result = await socialServiceInstance!.listFollowingPosts({
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
  const result = await socialServiceInstance!.listPostsWithCounts(type as any, pageSize ?? 50);
  return res.json(result);
});

const likeSchema = z.object({
  wallet: z.string(),
  contentId: z.string(),
  displayName: z.string().optional(),
});

router.post("/social/likes", async (req, res) => {
  if (!requireSocial(res)) return;
  const parsed = likeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  try {
    const result = await socialServiceInstance!.like(
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
  if (!requireSocial(res)) return;
  const parsed = likeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  try {
    const result = await socialServiceInstance!.unlike(
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
  if (!requireSocial(res)) return;
  const contentId = typeof req.query.contentId === "string" ? req.query.contentId : undefined;
  if (!contentId) {
    return res.status(400).json({ error: "contentId required" });
  }
  try {
    const count = await socialServiceInstance!.getLikes(contentId);
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
  if (!requireSocial(res)) return;
  const parsed = commentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  try {
    const result = await socialServiceInstance!.addComment(
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
  if (!requireSocial(res)) return;
  const contentId = typeof req.query.contentId === "string" ? req.query.contentId : undefined;
  if (!contentId) {
    return res.status(400).json({ error: "contentId required" });
  }
  const page = typeof req.query.page === "string" ? Number(req.query.page) : undefined;
  const pageSize = typeof req.query.pageSize === "string" ? Number(req.query.pageSize) : undefined;
  try {
    const raw = await socialServiceInstance!.getComments(contentId);
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
  if (!requireSocial(res)) return;
  const parsed = followSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  try {
    const result = await socialServiceInstance!.follow(
      parsed.data.wallet,
      parsed.data.targetProfileId,
      parsed.data.displayName
    );
    return res.json({ result });
  } catch (error: any) {
    return res.status(500).json({ error: error.message ?? "follow failed" });
  }
});

router.get("/social/feed/trending", async (req, res) => {
  if (!requireSocial(res)) return;
  const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
  const { posts, likeCounts, commentCounts } = await socialServiceInstance!.listPostsWithCounts(undefined, limit ?? 50);
  const sorted = [...posts].sort((a, b) => {
    const aLikes = likeCounts[a.contentId] ?? 0;
    const bLikes = likeCounts[b.contentId] ?? 0;
    if (bLikes !== aLikes) return bLikes - aLikes;
    return b.createdAt - a.createdAt;
  });
  const trimmed = limit ? sorted.slice(0, Math.max(limit, 0)) : sorted;
  return res.json({ posts: trimmed, likeCounts, commentCounts });
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

const subscribeSchema = z.object({
  personaId: z.string(),
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
      personaId: parsed.data.personaId,
      subscriberId,
      encPubKeyDerBase64: parsed.data.encPubKeyDerBase64,
    });
    return res.json({ subscriberId, bypass: true });
  }
  if (!personaRegistry) {
    return res.status(503).json({ error: "persona registry not configured" });
  }
  const subscriptionProgramId = process.env.SOLANA_SUBSCRIPTION_PROGRAM_ID;
  const rpcUrl = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
  if (!subscriptionProgramId) {
    return res.status(503).json({ error: "subscription program not configured" });
  }
  try {
    const subscriberPubkey = new PublicKey(parsed.data.subscriberWallet);
    const personaPda = personaRegistry.derivePersonaPda(parsed.data.personaId);
    const [subscriptionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("subscription"), personaPda.toBuffer(), subscriberPubkey.toBuffer()],
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
      personaId: parsed.data.personaId,
      subscriberId,
      encPubKeyDerBase64: encPubKeyBase64,
    });
    return res.json({ subscriberId });
  } catch (error: any) {
    return res.status(400).json({ error: error.message ?? "invalid subscriber wallet" });
  }
});

const onchainSubscribeSchema = z.object({
  personaId: z.string(),
  tierId: z.string(),
  pricingType: z.union([z.enum(["subscription_limited", "subscription_unlimited", "per_signal"]), z.number().int()]),
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
    if (personaRegistry && (!payload.makerPubkey || !payload.treasuryPubkey)) {
      const config = await personaRegistry.getPersonaConfig(payload.personaId);
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
  personaId: z.string(),
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
  personaId: z.string(),
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

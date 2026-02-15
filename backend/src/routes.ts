import { Router } from "express";
import { z } from "zod";
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
} from "./services/ServiceContainer";
import { subscriberIdFromPubkey, generateX25519Keypair } from "./crypto/hybrid";

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
  const feed = signals
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 50)
    .map((s) => {
      const persona = discoveryService.getPersona(s.personaId);
      return {
        id: s.signalHash,
        type: "signal",
        personaId: s.personaId,
        personaName: persona?.name ?? s.personaId,
        tierId: s.tierId,
        createdAt: s.createdAt,
        onchainTx: s.onchainTx,
      };
    });
  return res.json({ feed });
});

router.get("/personas", (_req, res) => {
  return res.json({ personas: discoveryService.listPersonas() });
});

router.get("/personas/:id", (req, res) => {
  const persona = discoveryService.getPersona(req.params.id);
  if (!persona) {
    return res.status(404).json({ error: "persona not found" });
  }
  return res.json({ persona });
});

router.get("/requests", (_req, res) => {
  return res.json({ requests: discoveryService.listRequests() });
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
  const profile = await userProfileStore.upsertUser(parsed.data.wallet, {
    displayName: parsed.data.displayName,
    bio: parsed.data.bio,
  });
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

const subscribeSchema = z.object({
  personaId: z.string(),
  encPubKeyDerBase64: z.string(),
});

router.post("/subscribe", async (req, res) => {
  const parsed = subscribeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const pub = Buffer.from(parsed.data.encPubKeyDerBase64, "base64");
  const subscriberId = subscriberIdFromPubkey(pub);
  await subscriberDirectory.addSubscriber({
    personaId: parsed.data.personaId,
    subscriberId,
    encPubKeyDerBase64: parsed.data.encPubKeyDerBase64,
  });
  return res.json({ subscriberId });
});

const onchainSubscribeSchema = z.object({
  personaId: z.string(),
  tierId: z.string(),
  pricingType: z.union([z.enum(["subscription_limited", "subscription_unlimited", "per_signal"]), z.number().int()]),
  evidenceLevel: z.union([z.enum(["trust", "verifier"]), z.number().int()]),
  expiresAt: z.number().optional(),
  quotaRemaining: z.number().int().optional(),
  subscriberPubkey: z.string().optional(),
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
    const signature = await onChainSubscriptionClient.subscribe(parsed.data);
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

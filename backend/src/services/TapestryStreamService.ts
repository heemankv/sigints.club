import { TapestryClient } from "../tapestry/TapestryClient";
import { StreamTier } from "../streams/StreamStore";

type StreamMetaInput = {
  streamId: string;
  name: string;
  domain: string;
  description: string;
  visibility?: "public" | "private";
  accuracy: string;
  latency: string;
  price: string;
  evidence: string;
  ownerWallet: string;
  authority?: string;
  dao?: string;
  onchainAddress?: string;
};

export type TapestryStreamProfile = StreamMetaInput & {
  id: string;
  tapestryProfileId: string;
  tiers: StreamTier[];
};

const STREAM_META_TYPE = "stream";
const TIER_TYPE = "tier";

const DEFAULT_REGISTRY_ID = "sigints-registry";
const REGISTRY_TYPE = "registry";

export class TapestryStreamService {
  constructor(
    private client: TapestryClient,
    private registryProfileId?: string
  ) {}

  async upsertStream(input: StreamMetaInput, tiers: StreamTier[]): Promise<string> {
    await this.ensureRegistryProfile();
    const profileId = await this.ensureStreamProfile(input);
    await this.upsertStreamMeta(profileId, input);
    await this.upsertTiers(profileId, input.streamId, tiers);
    if (this.registryProfileId) {
      try {
        await this.client.follow({ startId: this.registryProfileId, endId: profileId });
      } catch {
        // ignore follow conflicts
      }
    }
    return profileId;
  }

  async listStreams(limit = 50): Promise<TapestryStreamProfile[]> {
    await this.ensureRegistryProfile();
    if (!this.registryProfileId) {
      return [];
    }
    const following = await this.client.listFollowing({
      profileId: this.registryProfileId,
      pageSize: limit,
    });
    const profiles: Array<{ id: string }> = following?.profiles ?? [];
    const settled = await Promise.all(
      profiles.map((profile) => this.fetchStreamFromProfile(profile.id))
    );
    return settled.filter((s): s is TapestryStreamProfile => s !== null);
  }

  async getStream(streamId: string): Promise<TapestryStreamProfile | null> {
    const byStreamId = await this.searchStreamById(streamId);
    if (byStreamId) return byStreamId;
    await this.ensureRegistryProfile();
    if (!this.registryProfileId) return null;
    const list = await this.listStreams();
    return list.find((p) => p.streamId === streamId) ?? null;
  }

  private async ensureRegistryProfile(): Promise<void> {
    if (this.registryProfileId) {
      return;
    }
    const walletAddress =
      process.env.TAPESTRY_REGISTRY_WALLET ??
      process.env.SOLANA_ADDRESS ??
      process.env.SOLANA_PUBLIC_KEY;
    if (!walletAddress) {
      return;
    }
    try {
      const properties = [{ key: "type", value: REGISTRY_TYPE }];
      const res = await this.client.createProfile({
        walletAddress,
        username: DEFAULT_REGISTRY_ID,
        id: DEFAULT_REGISTRY_ID,
        bio: "Sigints stream registry",
        properties,
      });
      this.registryProfileId =
        res?.profile?.id ?? res?.data?.id ?? res?.id ?? DEFAULT_REGISTRY_ID;
    } catch {
      // ignore registry creation failures
    }
  }

  private async ensureStreamProfile(input: StreamMetaInput): Promise<string> {
    const username = toStreamUsername(input.streamId);
    const properties = [
      { key: "type", value: STREAM_META_TYPE },
      { key: "streamId", value: input.streamId },
      { key: "ownerWallet", value: input.ownerWallet },
    ];
    const res = await this.client.createProfile({
      walletAddress: input.ownerWallet,
      username,
      bio: input.description,
      id: username,
      properties,
    });
    const profileId = res?.profile?.id ?? res?.data?.id ?? res?.id ?? username;
    if (!profileId) {
      throw new Error("Unable to create Tapestry stream profile");
    }
    return profileId;
  }

  private async upsertStreamMeta(profileId: string, input: StreamMetaInput) {
    const properties = [
      { key: "type", value: STREAM_META_TYPE },
      { key: "text", value: input.name },
      { key: "streamId", value: input.streamId },
      { key: "name", value: input.name },
      { key: "domain", value: input.domain },
      { key: "description", value: input.description },
      ...(input.visibility ? [{ key: "visibility", value: input.visibility }] : []),
      { key: "accuracy", value: input.accuracy },
      { key: "latency", value: input.latency },
      { key: "price", value: input.price },
      { key: "evidence", value: input.evidence },
      { key: "ownerWallet", value: input.ownerWallet },
      ...(input.authority ? [{ key: "authority", value: input.authority }] : []),
      ...(input.dao ? [{ key: "dao", value: input.dao }] : []),
      ...(input.onchainAddress ? [{ key: "onchainAddress", value: input.onchainAddress }] : []),
    ];

    const contentId = streamMetaContentId(input.streamId);
    const created = await this.client.createContent({
      profileId,
      id: contentId,
      properties,
      execution: "FAST_UNCONFIRMED",
    });
    const resolvedId = created?.content?.id ?? created?.data?.id ?? created?.id ?? contentId;
    if (resolvedId) {
      await this.client.updateContent({ contentId: resolvedId, properties });
    }
  }

  private async upsertTiers(profileId: string, streamId: string, tiers: StreamTier[]) {
    for (const tier of tiers) {
      const properties = [
        { key: "type", value: TIER_TYPE },
        { key: "streamId", value: streamId },
        { key: "tierId", value: tier.tierId },
        { key: "pricingType", value: tier.pricingType },
        { key: "price", value: tier.price },
        { key: "evidenceLevel", value: tier.evidenceLevel },
        ...(tier.quota ? [{ key: "quota", value: tier.quota }] : []),
      ];
      const contentId = tierContentId(streamId, tier.tierId);
      const created = await this.client.createContent({
        profileId,
        id: contentId,
        properties,
        execution: "FAST_UNCONFIRMED",
      });
      const resolvedId = created?.content?.id ?? created?.data?.id ?? created?.id ?? contentId;
      if (resolvedId) {
        await this.client.updateContent({ contentId: resolvedId, properties });
      }
    }
  }

  private async fetchStreamFromProfile(profileId: string): Promise<TapestryStreamProfile | null> {
    const metaResponse = await this.client.listContents({
      profileId,
      filterField: "type",
      filterValue: STREAM_META_TYPE,
      orderByField: "created_at",
      orderByDirection: "DESC",
      pageSize: 1,
    });
    const metaEntry = metaResponse.contents?.[0];
    const meta = extractContent(metaEntry);
    if (!meta) return null;
    const streamId = String(meta.streamId ?? "").trim();
    if (!streamId) return null;

    const tiersResponse = await this.client.listContents({
      profileId,
      filterField: "type",
      filterValue: TIER_TYPE,
      orderByField: "created_at",
      orderByDirection: "DESC",
      pageSize: 50,
    });
    const tiers = (tiersResponse.contents ?? [])
      .map((entry) => parseTier(entry))
      .filter((tier): tier is StreamTier => Boolean(tier));

    return {
      id: streamId,
      tapestryProfileId: profileId,
      streamId,
      name: String(meta.name ?? meta.text ?? meta.streamId ?? "Stream"),
      domain: String(meta.domain ?? "general"),
      description: String(meta.description ?? ""),
      visibility: meta.visibility ? String(meta.visibility) : undefined,
      accuracy: String(meta.accuracy ?? ""),
      latency: String(meta.latency ?? ""),
      price: String(meta.price ?? ""),
      evidence: String(meta.evidence ?? ""),
      ownerWallet: String(meta.ownerWallet ?? ""),
      authority: meta.authority ? String(meta.authority) : undefined,
      dao: meta.dao ? String(meta.dao) : undefined,
      onchainAddress: meta.onchainAddress ? String(meta.onchainAddress) : undefined,
      tiers,
    };
  }

  private async searchStreamById(streamId: string): Promise<TapestryStreamProfile | null> {
    const response = await this.client.listContents({
      filterField: "streamId",
      filterValue: streamId,
      orderByField: "created_at",
      orderByDirection: "DESC",
      pageSize: 10,
    });
    const entry = (response.contents ?? []).find((item) => {
      const content = extractContent(item);
      return content?.type === STREAM_META_TYPE;
    });
    if (!entry) return null;
    const profileId = entry.authorProfile?.id;
    if (!profileId) return null;
    return this.fetchStreamFromProfile(profileId);
  }
}

function streamMetaContentId(streamId: string) {
  return `stream-${slugify(streamId)}-meta`;
}

function tierContentId(streamId: string, tierId: string) {
  return `stream-${slugify(streamId)}-tier-${slugify(tierId)}`;
}

function toStreamUsername(streamId: string) {
  return `stream-${slugify(streamId)}`;
}

function slugify(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9-_]/g, "-");
}

function extractContent(entry: any): Record<string, any> | null {
  if (!entry) return null;
  return entry.content ?? entry?.data?.content ?? null;
}

function parseTier(entry: any): StreamTier | null {
  const content = extractContent(entry);
  if (!content || content.type !== TIER_TYPE) return null;
  const tierId = String(content.tierId ?? "").trim();
  const pricingType = String(content.pricingType ?? "").trim();
  const price = String(content.price ?? "").trim();
  const evidenceLevel = String(content.evidenceLevel ?? "").trim();
  if (!tierId || !pricingType || !price || !evidenceLevel) return null;
  if (pricingType !== "subscription_unlimited") return null;
  const quotaRaw = content.quota ?? "";
  return {
    tierId,
    pricingType: pricingType as StreamTier["pricingType"],
    price,
    quota: quotaRaw ? String(quotaRaw) : undefined,
    evidenceLevel: evidenceLevel as StreamTier["evidenceLevel"],
  };
}

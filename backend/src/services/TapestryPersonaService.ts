import { TapestryClient } from "../tapestry/TapestryClient";
import { PersonaTier } from "../personas/PersonaStore";

type PersonaMetaInput = {
  personaId: string;
  name: string;
  domain: string;
  description: string;
  accuracy: string;
  latency: string;
  price: string;
  evidence: string;
  ownerWallet: string;
  authority?: string;
  dao?: string;
  onchainAddress?: string;
};

export type TapestryPersonaProfile = PersonaMetaInput & {
  id: string;
  tapestryProfileId: string;
  tiers: PersonaTier[];
};

const PERSONA_META_TYPE = "persona";
const TIER_TYPE = "tier";

export class TapestryPersonaService {
  constructor(
    private client: TapestryClient,
    private registryProfileId?: string
  ) {}

  async upsertPersona(input: PersonaMetaInput, tiers: PersonaTier[]): Promise<string> {
    const profileId = await this.ensurePersonaProfile(input);
    await this.upsertPersonaMeta(profileId, input);
    await this.upsertTiers(profileId, input.personaId, tiers);
    if (this.registryProfileId) {
      try {
        await this.client.follow({ startId: this.registryProfileId, endId: profileId });
      } catch {
        // ignore follow conflicts
      }
    }
    return profileId;
  }

  async listPersonas(limit = 50): Promise<TapestryPersonaProfile[]> {
    if (!this.registryProfileId) {
      return [];
    }
    const following = await this.client.listFollowing({
      profileId: this.registryProfileId,
      pageSize: limit,
    });
    const profiles = following?.profiles ?? [];
    const results: TapestryPersonaProfile[] = [];
    for (const profile of profiles) {
      const persona = await this.fetchPersonaFromProfile(profile.id);
      if (persona) results.push(persona);
    }
    return results;
  }

  async getPersona(personaId: string): Promise<TapestryPersonaProfile | null> {
    const byPersonaId = await this.searchPersonaById(personaId);
    if (byPersonaId) return byPersonaId;
    if (!this.registryProfileId) return null;
    const list = await this.listPersonas();
    return list.find((p) => p.personaId === personaId) ?? null;
  }

  private async ensurePersonaProfile(input: PersonaMetaInput): Promise<string> {
    const username = toPersonaUsername(input.personaId);
    const properties = [
      { key: "type", value: PERSONA_META_TYPE },
      { key: "personaId", value: input.personaId },
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
      throw new Error("Unable to create Tapestry persona profile");
    }
    return profileId;
  }

  private async upsertPersonaMeta(profileId: string, input: PersonaMetaInput) {
    const properties = [
      { key: "type", value: PERSONA_META_TYPE },
      { key: "text", value: input.name },
      { key: "personaId", value: input.personaId },
      { key: "name", value: input.name },
      { key: "domain", value: input.domain },
      { key: "description", value: input.description },
      { key: "accuracy", value: input.accuracy },
      { key: "latency", value: input.latency },
      { key: "price", value: input.price },
      { key: "evidence", value: input.evidence },
      { key: "ownerWallet", value: input.ownerWallet },
      ...(input.authority ? [{ key: "authority", value: input.authority }] : []),
      ...(input.dao ? [{ key: "dao", value: input.dao }] : []),
      ...(input.onchainAddress ? [{ key: "onchainAddress", value: input.onchainAddress }] : []),
    ];

    const contentId = personaMetaContentId(input.personaId);
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

  private async upsertTiers(profileId: string, personaId: string, tiers: PersonaTier[]) {
    for (const tier of tiers) {
      const properties = [
        { key: "type", value: TIER_TYPE },
        { key: "personaId", value: personaId },
        { key: "tierId", value: tier.tierId },
        { key: "pricingType", value: tier.pricingType },
        { key: "price", value: tier.price },
        { key: "evidenceLevel", value: tier.evidenceLevel },
        ...(tier.quota ? [{ key: "quota", value: tier.quota }] : []),
      ];
      const contentId = tierContentId(personaId, tier.tierId);
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

  private async fetchPersonaFromProfile(profileId: string): Promise<TapestryPersonaProfile | null> {
    const metaResponse = await this.client.listContents({
      profileId,
      filterField: "type",
      filterValue: PERSONA_META_TYPE,
      orderByField: "created_at",
      orderByDirection: "DESC",
      pageSize: 1,
    });
    const metaEntry = metaResponse.contents?.[0];
    const meta = extractContent(metaEntry);
    if (!meta) return null;
    const personaId = String(meta.personaId ?? "").trim();
    if (!personaId) return null;

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
      .filter((tier): tier is PersonaTier => Boolean(tier));

    return {
      id: personaId,
      tapestryProfileId: profileId,
      personaId,
      name: String(meta.name ?? meta.text ?? meta.personaId ?? "Persona"),
      domain: String(meta.domain ?? "general"),
      description: String(meta.description ?? ""),
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

  private async searchPersonaById(personaId: string): Promise<TapestryPersonaProfile | null> {
    const response = await this.client.listContents({
      filterField: "personaId",
      filterValue: personaId,
      orderByField: "created_at",
      orderByDirection: "DESC",
      pageSize: 10,
    });
    const entry = (response.contents ?? []).find((item) => {
      const content = extractContent(item);
      return content?.type === PERSONA_META_TYPE;
    });
    if (!entry) return null;
    const profileId = entry.authorProfile?.id;
    if (!profileId) return null;
    return this.fetchPersonaFromProfile(profileId);
  }
}

function personaMetaContentId(personaId: string) {
  return `persona-${slugify(personaId)}-meta`;
}

function tierContentId(personaId: string, tierId: string) {
  return `persona-${slugify(personaId)}-tier-${slugify(tierId)}`;
}

function toPersonaUsername(personaId: string) {
  return `persona-${slugify(personaId)}`;
}

function slugify(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9-_]/g, "-");
}

function extractContent(entry: any): Record<string, any> | null {
  if (!entry) return null;
  return entry.content ?? entry?.data?.content ?? null;
}

function parseTier(entry: any): PersonaTier | null {
  const content = extractContent(entry);
  if (!content || content.type !== TIER_TYPE) return null;
  const tierId = String(content.tierId ?? "").trim();
  const pricingType = String(content.pricingType ?? "").trim();
  const price = String(content.price ?? "").trim();
  const evidenceLevel = String(content.evidenceLevel ?? "").trim();
  if (!tierId || !pricingType || !price || !evidenceLevel) return null;
  const quotaRaw = content.quota ?? "";
  return {
    tierId,
    pricingType: pricingType as PersonaTier["pricingType"],
    price,
    quota: quotaRaw ? String(quotaRaw) : undefined,
    evidenceLevel: evidenceLevel as PersonaTier["evidenceLevel"],
  };
}

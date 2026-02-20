import { PersonaStore, PersonaTier } from "../personas";
import { hashTiersHex } from "../personas/tiersHash";
import { PersonaRegistryClient } from "./PersonaRegistryClient";
import { TapestryPersonaService } from "./TapestryPersonaService";

export type PersonaSummary = {
  id: string;
  name: string;
  domain: string;
  accuracy: string;
  latency: string;
  price: string;
  evidence: string;
  onchainAddress?: string;
  tapestryProfileId?: string;
};

export type TierOption = PersonaTier;

export type PersonaDetail = PersonaSummary & {
  description: string;
  tiers: TierOption[];
  ownerWallet?: string;
  authority?: string;
  dao?: string;
};

export type RequestSummary = {
  id: string;
  title: string;
  budget: string;
  latency: string;
  evidence: string;
};

export class DiscoveryService {
  constructor(
    private personaStore: PersonaStore,
    private personaRegistry?: PersonaRegistryClient,
    private tapestryProfileMap?: Record<string, string>,
    private tapestryPersonas?: TapestryPersonaService
  ) {}

  async listPersonas(): Promise<PersonaSummary[]> {
    const personas = await this.listPersonaDetails();
    return personas.map((persona) => ({
      id: persona.id,
      name: persona.name,
      domain: persona.domain,
      accuracy: persona.accuracy,
      latency: persona.latency,
      price: persona.price,
      evidence: persona.evidence,
      onchainAddress: persona.onchainAddress,
      tapestryProfileId: persona.tapestryProfileId,
    }));
  }

  async listPersonaDetails(): Promise<PersonaDetail[]> {
    if (this.tapestryPersonas) {
      try {
        const personas = await this.tapestryPersonas.listPersonas();
        return this.attachOnchain(personas);
      } catch {
        // fall back to local store if Tapestry is unavailable
      }
    }
    const personas = await this.personaStore.listPersonas();
    return this.attachOnchain(personas);
  }

  async getPersona(id: string): Promise<PersonaDetail | null> {
    if (this.tapestryPersonas) {
      try {
        const persona = await this.tapestryPersonas.getPersona(id);
        if (persona) {
          const enriched = await this.attachOnchain([persona]);
          return enriched[0] ?? null;
        }
      } catch {
        // fall back to local store if Tapestry is unavailable
      }
    }
    const persona = await this.personaStore.getPersona(id);
    if (!persona) return null;
    const enriched = await this.attachOnchain([persona]);
    return enriched[0] ?? null;
  }

  async listRequests(): Promise<RequestSummary[]> {
    return [
      {
        id: "req-eth",
        title: "ETH best price across 5 venues",
        budget: "0.1 SOL/mo",
        latency: "<3s",
        evidence: "Verifier",
      },
      {
        id: "req-anime",
        title: "Anime episode releases with timestamps",
        budget: "0.02 SOL/mo",
        latency: "<10s",
        evidence: "Trust",
      },
    ];
  }

  private async attachOnchain(personas: Array<PersonaDetail & { ownerWallet?: string }>): Promise<PersonaDetail[]> {
    if (personas.length === 0) {
      return [];
    }
    if (!this.personaRegistry) {
      return personas.map((persona) => ({
        ...persona,
        tapestryProfileId:
          persona.tapestryProfileId ?? this.tapestryProfileMap?.[persona.id],
      }));
    }
    const configs = await this.personaRegistry.getPersonaConfigs(personas.map((p) => p.id));
    return personas
      .map((persona) => {
        const config = configs[persona.id];
        if (!config || config.status !== 1) {
          return null;
        }
        const tiersHash = hashTiersHex(persona.tiers);
        if (tiersHash !== config.tiersHashHex) {
          return null;
        }
        return {
          ...persona,
          onchainAddress: config.pda,
          authority: config.authority,
          dao: config.dao,
          tapestryProfileId:
            persona.tapestryProfileId ?? this.tapestryProfileMap?.[persona.id],
        };
      })
      .filter((persona): persona is PersonaDetail => persona !== null);
  }
}

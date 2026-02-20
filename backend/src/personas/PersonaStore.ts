export type PersonaTier = {
  tierId: string;
  pricingType: "subscription_limited" | "subscription_unlimited" | "per_signal";
  price: string;
  quota?: string;
  evidenceLevel: "trust" | "verifier";
};

export type PersonaProfile = {
  id: string;
  name: string;
  domain: string;
  description: string;
  evidence: string;
  accuracy: string;
  latency: string;
  price: string;
  tiers: PersonaTier[];
  ownerWallet: string;
  createdAt: number;
  updatedAt: number;
};

export interface PersonaStore {
  listPersonas(): Promise<PersonaProfile[]>;
  getPersona(id: string): Promise<PersonaProfile | null>;
  upsertPersona(input: Omit<PersonaProfile, "createdAt" | "updatedAt">): Promise<PersonaProfile>;
}

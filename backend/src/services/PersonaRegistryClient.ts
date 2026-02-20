import { Connection, PublicKey } from "@solana/web3.js";
import { sha256Bytes } from "../utils/hash";

const PERSONA_SEED = Buffer.from("persona");
const PERSONA_ACCOUNT_SIZE = 8 + 32 + 32 + 32 + 32 + 1 + 1;

export type OnchainPersonaConfig = {
  personaIdHex: string;
  authority: string;
  dao: string;
  tiersHashHex: string;
  status: number;
  bump: number;
  pda: string;
};

type PersonaRegistryConfig = {
  rpcUrl: string;
  programId: string;
  commitment?: "processed" | "confirmed" | "finalized";
};

export class PersonaRegistryClient {
  private connection: Connection;
  private programId: PublicKey;

  constructor(private config: PersonaRegistryConfig) {
    this.connection = new Connection(config.rpcUrl, config.commitment ?? "confirmed");
    this.programId = new PublicKey(config.programId);
  }

  derivePersonaIdBytes(personaId: string): Buffer {
    return sha256Bytes(Buffer.from(personaId, "utf8"));
  }

  derivePersonaPda(personaId: string): PublicKey {
    const personaIdBytes = this.derivePersonaIdBytes(personaId);
    return PublicKey.findProgramAddressSync([PERSONA_SEED, personaIdBytes], this.programId)[0];
  }

  async getPersonaConfig(personaId: string): Promise<OnchainPersonaConfig | null> {
    const pda = this.derivePersonaPda(personaId);
    const account = await this.connection.getAccountInfo(pda);
    if (!account || !account.owner.equals(this.programId)) {
      return null;
    }
    return decodePersonaConfig(account.data, pda);
  }

  async getPersonaConfigs(personaIds: string[]): Promise<Record<string, OnchainPersonaConfig>> {
    if (personaIds.length === 0) return {};
    const pdas = personaIds.map((id) => this.derivePersonaPda(id));
    const accounts = await this.connection.getMultipleAccountsInfo(pdas);
    const result: Record<string, OnchainPersonaConfig> = {};
    accounts.forEach((account, idx) => {
      if (!account || !account.owner.equals(this.programId)) return;
      const config = decodePersonaConfig(account.data, pdas[idx]);
      const personaId = personaIds[idx];
      if (config) {
        result[personaId] = config;
      }
    });
    return result;
  }
}

function decodePersonaConfig(data: Buffer, pda: PublicKey): OnchainPersonaConfig | null {
  if (data.length < PERSONA_ACCOUNT_SIZE) {
    return null;
  }
  let offset = 8;
  const personaId = data.slice(offset, offset + 32);
  offset += 32;
  const authority = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;
  const dao = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;
  const tiersHash = data.slice(offset, offset + 32);
  offset += 32;
  const status = data[offset];
  offset += 1;
  const bump = data[offset];
  return {
    personaIdHex: personaId.toString("hex"),
    authority: authority.toBase58(),
    dao: dao.toBase58(),
    tiersHashHex: tiersHash.toString("hex"),
    status,
    bump,
    pda: pda.toBase58(),
  };
}

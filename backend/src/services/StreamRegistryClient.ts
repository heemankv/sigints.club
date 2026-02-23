import { Connection, PublicKey } from "@solana/web3.js";
import { sha256Bytes } from "../utils/hash";

const STREAM_SEED = Buffer.from("stream");
const STREAM_ACCOUNT_SIZE = 8 + 32 + 32 + 32 + 32 + 1 + 1 + 1;
const STREAM_ACCOUNT_SIZE_LEGACY = 8 + 32 + 32 + 32 + 32 + 1 + 1;

export type OnchainStreamConfig = {
  streamIdHex: string;
  authority: string;
  dao: string;
  tiersHashHex: string;
  visibility: number;
  status: number;
  bump: number;
  pda: string;
};

type StreamRegistryConfig = {
  rpcUrl: string;
  programId: string;
  commitment?: "processed" | "confirmed" | "finalized";
};

export class StreamRegistryClient {
  private connection: Connection;
  private programId: PublicKey;

  constructor(private config: StreamRegistryConfig) {
    this.connection = new Connection(config.rpcUrl, config.commitment ?? "confirmed");
    this.programId = new PublicKey(config.programId);
  }

  deriveStreamIdBytes(streamId: string): Buffer {
    return sha256Bytes(Buffer.from(streamId, "utf8"));
  }

  deriveStreamPda(streamId: string): PublicKey {
    const streamIdBytes = this.deriveStreamIdBytes(streamId);
    return PublicKey.findProgramAddressSync([STREAM_SEED, streamIdBytes], this.programId)[0];
  }

  async getStreamConfig(streamId: string): Promise<OnchainStreamConfig | null> {
    const pda = this.deriveStreamPda(streamId);
    const account = await this.connection.getAccountInfo(pda);
    if (!account || !account.owner.equals(this.programId)) {
      return null;
    }
    return decodeStreamConfig(account.data, pda);
  }

  async getStreamConfigs(streamIds: string[]): Promise<Record<string, OnchainStreamConfig>> {
    if (streamIds.length === 0) return {};
    const pdas = streamIds.map((id) => this.deriveStreamPda(id));
    const accounts = await this.connection.getMultipleAccountsInfo(pdas);
    const result: Record<string, OnchainStreamConfig> = {};
    accounts.forEach((account, idx) => {
      if (!account || !account.owner.equals(this.programId)) return;
      const config = decodeStreamConfig(account.data, pdas[idx]);
      const streamId = streamIds[idx];
      if (config) {
        result[streamId] = config;
      }
    });
    return result;
  }
}

function decodeStreamConfig(data: Buffer, pda: PublicKey): OnchainStreamConfig | null {
  if (data.length < STREAM_ACCOUNT_SIZE_LEGACY) {
    return null;
  }
  let offset = 8;
  const streamId = data.slice(offset, offset + 32);
  offset += 32;
  const authority = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;
  const dao = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;
  const tiersHash = data.slice(offset, offset + 32);
  offset += 32;
  let visibility = 1;
  let status: number;
  let bump: number;
  if (data.length >= STREAM_ACCOUNT_SIZE) {
    visibility = data[offset];
    offset += 1;
    status = data[offset];
    offset += 1;
    bump = data[offset];
  } else {
    status = data[offset];
    offset += 1;
    bump = data[offset];
  }
  return {
    streamIdHex: streamId.toString("hex"),
    authority: authority.toBase58(),
    dao: dao.toBase58(),
    tiersHashHex: tiersHash.toString("hex"),
    visibility,
    status,
    bump,
    pda: pda.toBase58(),
  };
}

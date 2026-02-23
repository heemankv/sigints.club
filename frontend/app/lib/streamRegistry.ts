"use client";

import { PublicKey } from "@solana/web3.js";
import { STREAM_REGISTRY_PROGRAM_ID } from "./constants";

export { buildTiersSeed, type TierInput } from "../../../sdk/src/solana/tiers";
export {
  deriveStreamIdBytes,
  deriveStreamPda,
  buildTiersHash,
  deriveTierConfigPda,
  buildCreateStreamInstruction,
  buildUpsertTierInstruction,
} from "../../../sdk/src/solana/streamRegistry";

export function resolveStreamRegistryProgramId(): PublicKey {
  return new PublicKey(STREAM_REGISTRY_PROGRAM_ID);
}

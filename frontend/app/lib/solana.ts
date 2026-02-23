"use client";

import { PublicKey } from "@solana/web3.js";
import { STREAM_REGISTRY_PROGRAM_ID, SUBSCRIPTION_PROGRAM_ID } from "./constants";

export {
  defaultExpiryMs,
  encodeSubscribeData,
  deriveSubscriptionPda,
  deriveSubscriptionMint,
  deriveSubscriberKeyPda,
  deriveWalletKeyPda,
  hasRegisteredWalletKey,
  deriveTierConfigPda,
  deriveStreamState,
  buildRegisterKeyInstruction,
  buildRegisterWalletKeyInstruction,
  resolvePricingType,
  resolveEvidenceLevel,
  decodeSubscriptionAccount,
  type DecodedSubscription,
} from "../../../sdk/src/solana/subscription";

export { PRICING_TYPE_MAP, EVIDENCE_LEVEL_MAP } from "../../../sdk/src/solana/constants";
export { sha256Bytes } from "../../../sdk/src/solana/shared";

import {
  buildSubscribeInstruction as buildSubscribeInstructionSdk,
  type DecodedSubscription as _DecodedSubscription,
} from "../../../sdk/src/solana/subscription";

export async function buildSubscribeInstruction(params: {
  programId: PublicKey;
  stream: PublicKey;
  subscriber: PublicKey;
  tierId: string;
  pricingType: number;
  evidenceLevel: number;
  expiresAtMs: number;
  quotaRemaining: number;
  priceLamports: number;
  maker: PublicKey;
  treasury: PublicKey;
}) {
  return buildSubscribeInstructionSdk({
    ...params,
    streamRegistryProgramId: resolveStreamRegistryId(),
  });
}

export function resolveProgramId(): PublicKey {
  return new PublicKey(SUBSCRIPTION_PROGRAM_ID);
}

export function resolveStreamRegistryId(): PublicKey {
  return new PublicKey(STREAM_REGISTRY_PROGRAM_ID);
}

export function resolveStreamPubkey(input?: string): PublicKey {
  if (!input) {
    throw new Error("Missing stream on-chain address");
  }
  return new PublicKey(input);
}

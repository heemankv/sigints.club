import { WrappedKey } from "../crypto/hybrid";
import { SignalMetadata, SignalVisibility } from "../metadata/MetadataStore";

export type PublicSignalPayload = {
  plaintext: string;
};

export type PrivateSignalPayload = {
  iv: string;
  tag: string;
  ciphertext: string;
};

export type SignalPayload = PublicSignalPayload | PrivateSignalPayload;

export type SignalEvent = {
  id: number;
  streamId: string;
  tierId: string;
  signalHash: string;
  visibility: SignalVisibility;
  createdAt: number;
  onchainTx?: string;
};

export interface SignalStore {
  upsertPublicSignal(meta: SignalMetadata, payload: PublicSignalPayload): Promise<void>;
  upsertPrivateSignal(
    meta: SignalMetadata,
    payload: PrivateSignalPayload,
    keybox: Record<string, WrappedKey>
  ): Promise<void>;

  listSignals(streamId: string): Promise<SignalMetadata[]>;
  listAllSignals(): Promise<SignalMetadata[]>;
  listSignalEvents(streamId: string, limit?: number, after?: number): Promise<SignalEvent[]>;
  listRecentSignalEvents(limit?: number, after?: number): Promise<SignalEvent[]>;
  getSignalByHash(hash: string): Promise<SignalMetadata | null>;
  getSignalByKeyboxHash(hash: string): Promise<SignalMetadata | null>;
  getPayloadByHash(hash: string): Promise<SignalPayload | null>;
  getKeyboxByHash(hash: string): Promise<Record<string, WrappedKey> | null>;
}

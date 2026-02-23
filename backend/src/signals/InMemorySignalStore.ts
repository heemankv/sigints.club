import { WrappedKey } from "../crypto/hybrid";
import { SignalMetadata } from "../metadata/MetadataStore";
import { SignalStore, PublicSignalPayload, PrivateSignalPayload, SignalPayload } from "./SignalStore";

export class InMemorySignalStore implements SignalStore {
  private signalsByStream = new Map<string, SignalMetadata>();
  private signalsByHash = new Map<string, SignalMetadata>();
  private signalsByKeyboxHash = new Map<string, SignalMetadata>();
  private payloadsByHash = new Map<string, SignalPayload>();
  private keyboxesByHash = new Map<string, Record<string, WrappedKey>>();

  async upsertPublicSignal(meta: SignalMetadata, payload: PublicSignalPayload): Promise<void> {
    this.evictExisting(meta.streamId);
    this.signalsByStream.set(meta.streamId, meta);
    this.signalsByHash.set(meta.signalHash, meta);
    this.payloadsByHash.set(meta.signalHash, payload);
  }

  async upsertPrivateSignal(
    meta: SignalMetadata,
    payload: PrivateSignalPayload,
    keybox: Record<string, WrappedKey>
  ): Promise<void> {
    this.evictExisting(meta.streamId);
    this.signalsByStream.set(meta.streamId, meta);
    this.signalsByHash.set(meta.signalHash, meta);
    if (meta.keyboxHash) {
      this.signalsByKeyboxHash.set(meta.keyboxHash, meta);
      this.keyboxesByHash.set(meta.keyboxHash, keybox);
    }
    this.payloadsByHash.set(meta.signalHash, payload);
  }

  async listSignals(streamId: string): Promise<SignalMetadata[]> {
    const meta = this.signalsByStream.get(streamId);
    return meta ? [meta] : [];
  }

  async listAllSignals(): Promise<SignalMetadata[]> {
    return Array.from(this.signalsByStream.values());
  }

  async getSignalByHash(hash: string): Promise<SignalMetadata | null> {
    return this.signalsByHash.get(hash) ?? null;
  }

  async getSignalByKeyboxHash(hash: string): Promise<SignalMetadata | null> {
    return this.signalsByKeyboxHash.get(hash) ?? null;
  }

  async getPayloadByHash(hash: string): Promise<SignalPayload | null> {
    return this.payloadsByHash.get(hash) ?? null;
  }

  async getKeyboxByHash(hash: string): Promise<Record<string, WrappedKey> | null> {
    return this.keyboxesByHash.get(hash) ?? null;
  }

  private evictExisting(streamId: string) {
    const existing = this.signalsByStream.get(streamId);
    if (!existing) return;
    this.signalsByStream.delete(streamId);
    this.signalsByHash.delete(existing.signalHash);
    this.payloadsByHash.delete(existing.signalHash);
    if (existing.keyboxHash) {
      this.signalsByKeyboxHash.delete(existing.keyboxHash);
      this.keyboxesByHash.delete(existing.keyboxHash);
    }
  }
}

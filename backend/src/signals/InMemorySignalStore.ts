import { WrappedKey } from "../crypto/hybrid";
import { SignalMetadata } from "../metadata/MetadataStore";
import { SignalStore, SignalEvent, PublicSignalPayload, PrivateSignalPayload, SignalPayload } from "./SignalStore";

export class InMemorySignalStore implements SignalStore {
  private signalsByStream = new Map<string, SignalMetadata>();
  private signalsByHash = new Map<string, SignalMetadata>();
  private signalsByKeyboxHash = new Map<string, SignalMetadata>();
  private payloadsByHash = new Map<string, SignalPayload>();
  private keyboxesByHash = new Map<string, Record<string, WrappedKey>>();
  private events: SignalEvent[] = [];
  private nextEventId = 1;

  async upsertPublicSignal(meta: SignalMetadata, payload: PublicSignalPayload): Promise<void> {
    this.evictExisting(meta.streamId);
    this.signalsByStream.set(meta.streamId, meta);
    this.signalsByHash.set(meta.signalHash, meta);
    this.payloadsByHash.set(meta.signalHash, payload);
    this.events.push(this.toEvent(meta));
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
    this.events.push(this.toEvent(meta));
  }

  async listSignals(streamId: string): Promise<SignalMetadata[]> {
    const meta = this.signalsByStream.get(streamId);
    return meta ? [meta] : [];
  }

  async listAllSignals(): Promise<SignalMetadata[]> {
    return Array.from(this.signalsByStream.values());
  }

  async listSignalEvents(streamId: string, limit = 10, after?: number): Promise<SignalEvent[]> {
    const filtered = this.events.filter((event) => event.streamId === streamId && (!after || event.id > after));
    const ordered = after
      ? filtered.sort((a, b) => a.id - b.id)
      : filtered.sort((a, b) => b.id - a.id);
    return ordered.slice(0, Math.max(1, Math.min(limit, 50)));
  }

  async listRecentSignalEvents(limit = 20, after?: number): Promise<SignalEvent[]> {
    const filtered = this.events.filter((event) => !after || event.id > after);
    const ordered = after
      ? filtered.sort((a, b) => a.id - b.id)
      : filtered.sort((a, b) => b.id - a.id);
    return ordered.slice(0, Math.max(1, Math.min(limit, 50)));
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

  private toEvent(meta: SignalMetadata): SignalEvent {
    return {
      id: this.nextEventId++,
      streamId: meta.streamId,
      tierId: meta.tierId,
      signalHash: meta.signalHash,
      visibility: meta.visibility,
      createdAt: meta.createdAt,
      onchainTx: meta.onchainTx,
    };
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

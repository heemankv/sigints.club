import { StreamTier } from "../streams";
import { hashTiersHex } from "../streams/tiersHash";
import { StreamRegistryClient } from "./StreamRegistryClient";
import { TapestryStreamService } from "./TapestryStreamService";
import { tapestryCache } from "./TapestryCache";

// Cache TTLs
const TTL_STREAMS_LIST = 30_000;   // 30 s — kept warm by background poller
const TTL_STREAM_DETAIL = 60_000;  // 60 s per individual stream

export type StreamSummary = {
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

export type TierOption = StreamTier;

export type StreamDetail = StreamSummary & {
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
    private streamRegistry?: StreamRegistryClient,
    private tapestryStreams?: TapestryStreamService
  ) {}

  async listStreams(): Promise<StreamSummary[]> {
    const streams = await this.listStreamDetails();
    return streams.map((stream) => ({
      id: stream.id,
      name: stream.name,
      domain: stream.domain,
      accuracy: stream.accuracy,
      latency: stream.latency,
      price: stream.price,
      evidence: stream.evidence,
      onchainAddress: stream.onchainAddress,
      tapestryProfileId: stream.tapestryProfileId,
    }));
  }

  async listStreamDetails(): Promise<StreamDetail[]> {
    if (!this.tapestryStreams) {
      throw new Error("Tapestry is required for stream discovery");
    }
    return tapestryCache.swr(
      "streams:all",
      TTL_STREAMS_LIST,
      () => this._rawListStreamDetails()
    );
  }

  async getStream(id: string): Promise<StreamDetail | null> {
    if (!this.tapestryStreams) {
      throw new Error("Tapestry is required for stream discovery");
    }
    return tapestryCache.swr(
      `stream:${id}`,
      TTL_STREAM_DETAIL,
      () => this._rawGetStream(id)
    );
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

  /**
   * Start background polling so the streams list is always warm.
   * Call once on server startup.
   */
  startBackgroundRefresh(intervalMs = 20_000): void {
    tapestryCache.startPoller(
      "streams:all",
      intervalMs,
      intervalMs + 5_000,
      () => this._rawListStreamDetails()
    );
    // eslint-disable-next-line no-console
    console.log(`[TapestryCache] Streams background refresh started (interval: ${intervalMs}ms)`);
  }

  // ─── Private raw fetchers (bypass cache, used by swr + poller) ───────────

  private async _rawListStreamDetails(): Promise<StreamDetail[]> {
    const streams = await this.tapestryStreams!.listStreams();
    return this.attachOnchain(streams);
  }

  private async _rawGetStream(id: string): Promise<StreamDetail | null> {
    const stream = await this.tapestryStreams!.getStream(id);
    if (!stream) return null;
    const enriched = await this.attachOnchain([stream]);
    return enriched[0] ?? null;
  }

  private async attachOnchain(streams: Array<StreamDetail & { ownerWallet?: string }>): Promise<StreamDetail[]> {
    if (streams.length === 0) {
      return [];
    }
    if (!this.streamRegistry) {
      return streams;
    }
    const configs = await this.streamRegistry.getStreamConfigs(streams.map((p) => p.id));
    const results: StreamDetail[] = [];
    for (const stream of streams) {
      const config = configs[stream.id];
      if (!config || config.status !== 1) continue;
      const tiersHash = hashTiersHex(stream.tiers);
      if (tiersHash !== config.tiersHashHex) continue;
      results.push({
        ...stream,
        onchainAddress: config.pda,
        authority: config.authority,
        dao: config.dao,
        tapestryProfileId: stream.tapestryProfileId,
      });
    }
    return results;
  }
}

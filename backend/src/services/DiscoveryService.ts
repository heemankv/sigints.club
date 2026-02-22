import { StreamTier } from "../streams";
import { hashTiersHex } from "../streams/tiersHash";
import { StreamRegistryClient } from "./StreamRegistryClient";
import { TapestryStreamService } from "./TapestryStreamService";

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
    const streams = await this.tapestryStreams.listStreams();
    return this.attachOnchain(streams);
  }

  async getStream(id: string): Promise<StreamDetail | null> {
    if (!this.tapestryStreams) {
      throw new Error("Tapestry is required for stream discovery");
    }
    const stream = await this.tapestryStreams.getStream(id);
    if (!stream) {
      return null;
    }
    const enriched = await this.attachOnchain([stream]);
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

  private async attachOnchain(streams: Array<StreamDetail & { ownerWallet?: string }>): Promise<StreamDetail[]> {
    if (streams.length === 0) {
      return [];
    }
    if (!this.streamRegistry) {
      return streams;
    }
    const configs = await this.streamRegistry.getStreamConfigs(streams.map((p) => p.id));
    return streams
      .map((stream) => {
        const config = configs[stream.id];
        if (!config || config.status !== 1) {
          return null;
        }
        const tiersHash = hashTiersHex(stream.tiers);
        if (tiersHash !== config.tiersHashHex) {
          return null;
        }
        return {
          ...stream,
          onchainAddress: config.pda,
          authority: config.authority,
          dao: config.dao,
          tapestryProfileId: stream.tapestryProfileId,
        };
      })
      .filter((stream): stream is StreamDetail => stream !== null);
  }
}

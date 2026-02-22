import { MetadataStore, SignalMetadata } from "../MetadataStore";

export class InMemoryMetadata implements MetadataStore {
  private signals: SignalMetadata[] = [];

  async addSignal(meta: SignalMetadata): Promise<void> {
    this.signals.push(meta);
  }

  async listSignals(streamId: string): Promise<SignalMetadata[]> {
    return this.signals.filter((s) => s.streamId === streamId);
  }

  async listAllSignals(): Promise<SignalMetadata[]> {
    return this.signals;
  }
}

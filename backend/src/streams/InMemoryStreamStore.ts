import { StreamProfile, StreamStore } from "./StreamStore";

export class InMemoryStreamStore implements StreamStore {
  private streams: StreamProfile[] = [];

  async listStreams(): Promise<StreamProfile[]> {
    return [...this.streams];
  }

  async getStream(id: string): Promise<StreamProfile | null> {
    return this.streams.find((stream) => stream.id === id) ?? null;
  }

  async upsertStream(input: Omit<StreamProfile, "createdAt" | "updatedAt">): Promise<StreamProfile> {
    const now = Date.now();
    const existingIndex = this.streams.findIndex((stream) => stream.id === input.id);
    if (existingIndex >= 0) {
      const updated: StreamProfile = {
        ...this.streams[existingIndex],
        ...input,
        updatedAt: now,
      };
      this.streams[existingIndex] = updated;
      return updated;
    }
    const created: StreamProfile = {
      ...input,
      createdAt: now,
      updatedAt: now,
    };
    this.streams.push(created);
    return created;
  }
}

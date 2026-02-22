import { promises as fs } from "node:fs";
import path from "node:path";
import { StreamProfile, StreamStore } from "./StreamStore";

export class FileStreamStore implements StreamStore {
  constructor(private filePath: string = path.resolve(process.cwd(), "data", "streams.json")) {}

  async listStreams(): Promise<StreamProfile[]> {
    return this.readAll();
  }

  async getStream(id: string): Promise<StreamProfile | null> {
    const streams = await this.readAll();
    return streams.find((stream) => stream.id === id) ?? null;
  }

  async upsertStream(input: Omit<StreamProfile, "createdAt" | "updatedAt">): Promise<StreamProfile> {
    const streams = await this.readAll();
    const now = Date.now();
    const existingIndex = streams.findIndex((stream) => stream.id === input.id);
    if (existingIndex >= 0) {
      const updated: StreamProfile = {
        ...streams[existingIndex],
        ...input,
        updatedAt: now,
      };
      streams[existingIndex] = updated;
      await this.writeAll(streams);
      return updated;
    }
    const created: StreamProfile = {
      ...input,
      createdAt: now,
      updatedAt: now,
    };
    streams.push(created);
    await this.writeAll(streams);
    return created;
  }

  private async readAll(): Promise<StreamProfile[]> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      return JSON.parse(raw) as StreamProfile[];
    } catch {
      return [];
    }
  }

  private async writeAll(data: StreamProfile[]): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2));
  }
}

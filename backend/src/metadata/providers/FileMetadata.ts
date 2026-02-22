import { promises as fs } from "node:fs";
import path from "node:path";
import { MetadataStore, SignalMetadata } from "../MetadataStore";

export class FileMetadata implements MetadataStore {
  private filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath ?? path.resolve(process.cwd(), "data", "metadata.json");
  }

  async addSignal(meta: SignalMetadata): Promise<void> {
    const data = await this.readAll();
    data.push(meta);
    await this.writeAll(data);
  }

  async listSignals(streamId: string): Promise<SignalMetadata[]> {
    const data = await this.readAll();
    return data.filter((s) => s.streamId === streamId);
  }

  async listAllSignals(): Promise<SignalMetadata[]> {
    return this.readAll();
  }

  private async readAll(): Promise<SignalMetadata[]> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      return JSON.parse(raw) as SignalMetadata[];
    } catch {
      return [];
    }
  }

  private async writeAll(data: SignalMetadata[]): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2));
  }
}

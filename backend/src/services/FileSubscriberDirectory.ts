import { promises as fs } from "node:fs";
import path from "node:path";
import { SubscriberDirectory, SubscriberRecord } from "./SubscriberDirectory";

export class FileSubscriberDirectory implements SubscriberDirectory {
  private filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath ?? path.resolve(process.cwd(), "data", "subscribers.json");
  }

  async addSubscriber(record: SubscriberRecord): Promise<void> {
    const data = await this.readAll();
    data.push(record);
    await this.writeAll(data);
  }

  async listSubscribers(personaId: string): Promise<SubscriberRecord[]> {
    const data = await this.readAll();
    return data.filter((r) => r.personaId === personaId);
  }

  private async readAll(): Promise<SubscriberRecord[]> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      return JSON.parse(raw) as SubscriberRecord[];
    } catch {
      return [];
    }
  }

  private async writeAll(data: SubscriberRecord[]): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2));
  }
}

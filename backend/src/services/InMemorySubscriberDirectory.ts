import { SubscriberDirectory, SubscriberRecord } from "./SubscriberDirectory";

export class InMemorySubscriberDirectory implements SubscriberDirectory {
  private records: SubscriberRecord[] = [];

  async addSubscriber(record: SubscriberRecord): Promise<void> {
    this.records.push(record);
  }

  async listSubscribers(personaId: string): Promise<SubscriberRecord[]> {
    return this.records.filter((r) => r.personaId === personaId);
  }
}

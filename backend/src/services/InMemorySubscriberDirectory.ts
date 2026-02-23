import { SubscriberDirectory, SubscriberRecord } from "./SubscriberDirectory";

export class InMemorySubscriberDirectory implements SubscriberDirectory {
  private records: SubscriberRecord[] = [];

  async addSubscriber(record: SubscriberRecord): Promise<void> {
    this.records = this.records.filter(
      (r) => !(r.streamId === record.streamId && r.subscriberId === record.subscriberId)
    );
    this.records.push(record);
  }

  async listSubscribers(streamId: string): Promise<SubscriberRecord[]> {
    return this.records.filter((r) => r.streamId === streamId);
  }
}

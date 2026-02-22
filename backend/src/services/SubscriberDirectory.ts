export type SubscriberRecord = {
  streamId: string;
  subscriberId: string; // hash(pubkey)
  encPubKeyDerBase64: string;
};

export interface SubscriberDirectory {
  addSubscriber(record: SubscriberRecord): Promise<void>;
  listSubscribers(streamId: string): Promise<SubscriberRecord[]>;
}

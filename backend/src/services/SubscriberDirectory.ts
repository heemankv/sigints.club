export type SubscriberRecord = {
  personaId: string;
  subscriberId: string; // hash(pubkey)
  encPubKeyDerBase64: string;
};

export interface SubscriberDirectory {
  addSubscriber(record: SubscriberRecord): Promise<void>;
  listSubscribers(personaId: string): Promise<SubscriberRecord[]>;
}

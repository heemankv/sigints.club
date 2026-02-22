export type SignalVisibility = "public" | "private";

export type SignalMetadata = {
  streamId: string;
  tierId: string;
  signalHash: string;
  signalPointer: string;
  keyboxHash?: string | null;
  keyboxPointer?: string | null;
  visibility: SignalVisibility;
  createdAt: number;
  onchainTx?: string;
};

export interface MetadataStore {
  addSignal(meta: SignalMetadata): Promise<void>;
  listSignals(streamId: string): Promise<SignalMetadata[]>;
  listAllSignals(): Promise<SignalMetadata[]>;
}

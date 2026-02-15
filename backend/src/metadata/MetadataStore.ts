export type SignalMetadata = {
  personaId: string;
  tierId: string;
  signalHash: string;
  signalPointer: string;
  keyboxHash: string;
  keyboxPointer: string;
  createdAt: number;
  onchainTx?: string;
};

export interface MetadataStore {
  addSignal(meta: SignalMetadata): Promise<void>;
  listSignals(personaId: string): Promise<SignalMetadata[]>;
  listAllSignals(): Promise<SignalMetadata[]>;
}

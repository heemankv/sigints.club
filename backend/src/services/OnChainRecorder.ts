import { SignalMetadata } from "./MetadataStore";

export type RecordSignalInput = {
  personaId: string;
  tierId: string;
  signalHash: string;
  signalPointer: string;
  keyboxHash: string;
  keyboxPointer: string;
  createdAt: number;
};

export interface OnChainRecorder {
  recordSignal(input: RecordSignalInput): Promise<string | undefined>;
}

export function toRecordSignalInput(meta: SignalMetadata): RecordSignalInput {
  return {
    personaId: meta.personaId,
    tierId: meta.tierId,
    signalHash: meta.signalHash,
    signalPointer: meta.signalPointer,
    keyboxHash: meta.keyboxHash,
    keyboxPointer: meta.keyboxPointer,
    createdAt: meta.createdAt,
  };
}

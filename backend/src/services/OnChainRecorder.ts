import { SignalMetadata } from "../metadata/MetadataStore";

export type RecordSignalInput = {
  streamId: string;
  tierId: string;
  signalHash: string;
  signalPointer: string;
  keyboxHash?: string | null;
  keyboxPointer?: string | null;
};

export interface OnChainRecorder {
  recordSignal(input: RecordSignalInput): Promise<string | undefined>;
}

export function toRecordSignalInput(meta: SignalMetadata): RecordSignalInput {
  return {
    streamId: meta.streamId,
    tierId: meta.tierId,
    signalHash: meta.signalHash,
    signalPointer: meta.signalPointer,
    keyboxHash: meta.keyboxHash,
    keyboxPointer: meta.keyboxPointer,
  };
}

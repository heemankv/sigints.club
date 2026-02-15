import { OnChainRecorder, RecordSignalInput } from "./OnChainRecorder";

export class OnChainStub implements OnChainRecorder {
  async recordSignal(input: RecordSignalInput): Promise<string | undefined> {
    // MVP stub: log only. Replace with real Solana tx later.
    // eslint-disable-next-line no-console
    console.log("[on-chain stub] record_signal", input);
    return undefined;
  }
}

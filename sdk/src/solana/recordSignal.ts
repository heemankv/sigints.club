export type RecordSignalParams = {
  streamPubkey: string;
  payerPubkey: string;
  signalHash: string; // hex
  signalPointerHash: string; // hex
  keyboxHash: string; // hex
  keyboxPointerHash: string; // hex
  createdAt: number; // unix ms
};

export type RecordSignalInstruction = {
  programId: string;
  accounts: {
    signalPda: string;
    stream: string;
    payer: string;
    systemProgram: string;
  };
  data: RecordSignalParams;
  pdaSeeds: string[];
};

// This is a stub. It outlines what needs to be sent on-chain without binding to a specific Solana client.
export function buildRecordSignalInstruction(params: RecordSignalParams): RecordSignalInstruction {
  return {
    programId: "TODO:subscription_royalty_program_id",
    accounts: {
      signalPda: "TODO:derive_pda('signal_latest', stream)",
      stream: params.streamPubkey,
      payer: params.payerPubkey,
      systemProgram: "11111111111111111111111111111111",
    },
    data: params,
    pdaSeeds: ["signal_latest", params.streamPubkey],
  };
}

export function recordSignalStub(params: RecordSignalParams) {
  const ix = buildRecordSignalInstruction(params);
  // eslint-disable-next-line no-console
  console.log("RecordSignal stub", ix);
  return ix;
}

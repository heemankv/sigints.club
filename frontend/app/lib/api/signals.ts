import { fetchSignalEvents as sdkFetchSignalEvents } from "../sdkBackend";
import type { SignalEvent } from "../types";

export type SignalEventsResponse = {
  events: SignalEvent[];
};

export async function fetchSignalEvents(params: {
  streamId?: string;
  limit?: number;
  after?: number;
}): Promise<SignalEventsResponse> {
  return sdkFetchSignalEvents<SignalEventsResponse>(params);
}

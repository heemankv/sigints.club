import { SignalMetadata } from "./MetadataStore";

export type SocialPublishInput = {
  streamId: string;
  content: string;
  metadata: SignalMetadata;
};

export interface SocialPublisher {
  publishSignal(input: SocialPublishInput): Promise<void>;
}

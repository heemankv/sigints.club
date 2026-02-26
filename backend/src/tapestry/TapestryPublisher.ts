import { TapestryClient } from "./TapestryClient";
import { MockTapestryClient } from "./mock";
import { SocialPublishInput, SocialPublisher } from "../services/SocialPublisher";
import { TapestryStreamService } from "../services/TapestryStreamService";

export class TapestryPublisher implements SocialPublisher {
  constructor(
    private client: TapestryClient | MockTapestryClient,
    private defaultProfileId?: string,
    private profileMap?: Record<string, string>,
    private tapestryStreams?: TapestryStreamService
  ) {}

  async publishSignal(input: SocialPublishInput): Promise<void> {
    let profileId = this.profileMap?.[input.streamId] ?? this.defaultProfileId;
    if (!profileId && this.tapestryStreams) {
      const stream = await this.tapestryStreams.getStream(input.streamId);
      profileId = stream?.tapestryProfileId;
    }
    if (!profileId) {
      return;
    }

    const properties = [
      { key: "type", value: "signal" },
      { key: "text", value: input.content },
      { key: "streamId", value: input.streamId },
      { key: "tierId", value: input.metadata.tierId },
      { key: "visibility", value: input.metadata.visibility },
      { key: "signalHash", value: input.metadata.signalHash },
      { key: "signalPointer", value: input.metadata.signalPointer },
      ...(input.metadata.keyboxHash ? [{ key: "keyboxHash", value: input.metadata.keyboxHash }] : []),
    ];

    await this.client.createContent({
      profileId,
      properties,
      id: `signal-${input.metadata.signalHash.slice(0, 12)}`,
      execution: "FAST_UNCONFIRMED",
    });
  }
}

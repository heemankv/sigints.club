import { TapestryClient } from "./TapestryClient";
import { SocialPublishInput, SocialPublisher } from "../services/SocialPublisher";

export class TapestryPublisher implements SocialPublisher {
  constructor(
    private client: TapestryClient,
    private defaultProfileId?: string,
    private profileMap?: Record<string, string>
  ) {}

  async publishSignal(input: SocialPublishInput): Promise<void> {
    const profileId = this.profileMap?.[input.personaId] ?? this.defaultProfileId;
    if (!profileId) {
      return;
    }

    await this.client.createContent({
      profileId,
      content: input.content,
      contentType: "text",
      customProperties: [
        { key: "type", value: "signal" },
        { key: "personaId", value: input.personaId },
        { key: "tierId", value: input.metadata.tierId },
        { key: "signalHash", value: input.metadata.signalHash },
        { key: "signalPointer", value: input.metadata.signalPointer },
        { key: "keyboxHash", value: input.metadata.keyboxHash },
      ],
      execution: "FAST_UNCONFIRMED",
    });
  }
}

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

    const properties = [
      { key: "type", value: "signal" },
      { key: "text", value: input.content },
      { key: "personaId", value: input.personaId },
      { key: "tierId", value: input.metadata.tierId },
      { key: "signalHash", value: input.metadata.signalHash },
      { key: "signalPointer", value: input.metadata.signalPointer },
      { key: "keyboxHash", value: input.metadata.keyboxHash },
    ];

    await this.client.createContent({
      profileId,
      properties,
      id: `signal-${input.metadata.signalHash.slice(0, 12)}`,
      execution: "FAST_UNCONFIRMED",
    });
  }
}

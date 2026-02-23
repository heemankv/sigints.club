import { SignalMetadata } from "../metadata/MetadataStore";
import { SignalStore } from "../signals/SignalStore";
import { sha256Hex } from "../utils/hash";
import { stableStringify } from "../utils/json";
import {
  generateSymmetricKey,
  encryptSignal,
  wrapKeyForSubscriber,
  WrappedKey,
} from "../crypto/hybrid";
import { SocialPublisher } from "./SocialPublisher";

export type Subscriber = {
  encPubKeyDerBase64: string;
};

export type PublishResult = {
  metadata: SignalMetadata;
  keybox?: Record<string, WrappedKey>;
};

export class SignalService {
  constructor(
    private signals: SignalStore,
    private socialPublisher?: SocialPublisher
  ) {}

  async publishSignal(
    streamId: string,
    tierId: string,
    plaintext: Buffer,
    subscribers: Subscriber[],
    visibility: "public" | "private" = "private"
  ): Promise<PublishResult> {
    if (visibility === "public") {
      const payload = {
        plaintext: plaintext.toString("base64"),
      };
      const payloadBytes = Buffer.from(stableStringify(payload));
      const signalHash = sha256Hex(payloadBytes);
      const signalPointer = { id: `backend://public/${signalHash}` };
      const meta: SignalMetadata = {
        streamId,
        tierId,
        signalHash,
        signalPointer: signalPointer.id,
        keyboxHash: null,
        keyboxPointer: null,
        visibility,
        createdAt: Date.now(),
      };
      await this.signals.upsertPublicSignal(meta, payload);
      if (this.socialPublisher) {
        await this.socialPublisher.publishSignal({
          streamId,
          content: plaintext.toString("utf8"),
          metadata: meta,
        });
      }
      return { metadata: meta };
    }

    const symKey = generateSymmetricKey();
    const { ciphertext, iv, tag } = encryptSignal(plaintext, symKey);

    const ciphertextPayload = {
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    };

    const signalHash = sha256Hex(Buffer.from(stableStringify(ciphertextPayload)));
    const signalPointer = { id: `backend://ciphertext/${signalHash}` };

    const keybox: Record<string, WrappedKey> = {};
    for (const subscriber of subscribers) {
      try {
        const wrapped = wrapKeyForSubscriber(
          Buffer.from(subscriber.encPubKeyDerBase64, "base64"),
          symKey
        );
        keybox[wrapped.subscriberId] = wrapped;
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn("Skipping invalid subscriber key", error);
      }
    }

    const keyboxHash = sha256Hex(Buffer.from(stableStringify(keybox)));
    const keyboxPointer = { id: `backend://keybox/${keyboxHash}` };

    const meta: SignalMetadata = {
      streamId,
      tierId,
      signalHash,
      signalPointer: signalPointer.id,
      keyboxHash,
      keyboxPointer: keyboxPointer.id,
      visibility,
      createdAt: Date.now(),
    };
    await this.signals.upsertPrivateSignal(meta, ciphertextPayload, keybox);

    if (this.socialPublisher) {
      await this.socialPublisher.publishSignal({
        streamId,
        content: plaintext.toString("utf8"),
        metadata: meta,
      });
    }

    return { metadata: meta, keybox };
  }
}

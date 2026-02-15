import { StorageProvider } from "../storage/StorageProvider";
import { MetadataStore, SignalMetadata } from "../metadata/MetadataStore";
import { sha256Hex } from "../utils/hash";
import {
  generateSymmetricKey,
  encryptSignal,
  wrapKeyForSubscriber,
  WrappedKey,
} from "../crypto/hybrid";
import { SocialPublisher } from "./SocialPublisher";
import { OnChainRecorder, toRecordSignalInput } from "./OnChainRecorder";

export type Subscriber = {
  encPubKeyDerBase64: string;
};

export type PublishResult = {
  metadata: SignalMetadata;
  keybox: Record<string, WrappedKey>;
};

export class SignalService {
  constructor(
    private storage: StorageProvider,
    private metadata: MetadataStore,
    private socialPublisher?: SocialPublisher,
    private onChainRecorder?: OnChainRecorder
  ) {}

  async publishSignal(
    personaId: string,
    tierId: string,
    plaintext: Buffer,
    subscribers: Subscriber[]
  ): Promise<PublishResult> {
    const symKey = generateSymmetricKey();
    const { ciphertext, iv, tag } = encryptSignal(plaintext, symKey);

    const ciphertextPayload = Buffer.from(
      JSON.stringify({
        iv: iv.toString("base64"),
        tag: tag.toString("base64"),
        ciphertext: ciphertext.toString("base64"),
      })
    );

    const signalHash = sha256Hex(ciphertextPayload);
    const { pointer: signalPointer } = await this.storage.putCiphertext(
      ciphertextPayload,
      signalHash
    );

    const keybox: Record<string, WrappedKey> = {};
    for (const subscriber of subscribers) {
      const wrapped = wrapKeyForSubscriber(
        Buffer.from(subscriber.encPubKeyDerBase64, "base64"),
        symKey
      );
      keybox[wrapped.subscriberId] = wrapped;
    }

    const keyboxPayload = Buffer.from(JSON.stringify(keybox));
    const keyboxHash = sha256Hex(keyboxPayload);
    const { pointer: keyboxPointer } = await this.storage.putKeybox(
      keyboxPayload,
      keyboxHash
    );

    const meta: SignalMetadata = {
      personaId,
      tierId,
      signalHash,
      signalPointer: signalPointer.id,
      keyboxHash,
      keyboxPointer: keyboxPointer.id,
      createdAt: Date.now(),
    };
    if (this.onChainRecorder) {
      try {
        const signature = await this.onChainRecorder.recordSignal(toRecordSignalInput(meta));
        if (signature) {
          meta.onchainTx = signature;
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn("on-chain record_signal failed", error);
      }
    }

    await this.metadata.addSignal(meta);

    if (this.socialPublisher) {
      await this.socialPublisher.publishSignal({
        personaId,
        content: plaintext.toString("utf8"),
        metadata: meta,
      });
    }

    return { metadata: meta, keybox };
  }
}

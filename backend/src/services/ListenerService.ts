import { StorageProvider, StoragePointer } from "../storage/StorageProvider";
import { SignalMetadata } from "../metadata/MetadataStore";
import { sha256Hex } from "../utils/hash";
import {
  decryptSignal,
  subscriberIdFromPubkey,
  unwrapKeyForSubscriber,
  WrappedKey,
} from "../crypto/hybrid";

export type SubscriberKeys = {
  privateKeyDerBase64: string;
  publicKeyDerBase64: string;
};

export class ListenerService {
  constructor(private storage: StorageProvider) {}

  async decryptLatestSignal(meta: SignalMetadata, keys?: SubscriberKeys): Promise<Buffer> {
    if (meta.visibility === "public") {
      const signalPointer = this.pointerFromId(meta.signalPointer);
      const signalBytes = await this.storage.getPublic(signalPointer);
      if (sha256Hex(signalBytes) !== meta.signalHash) {
        throw new Error("signal hash mismatch");
      }
      const payload = JSON.parse(Buffer.from(signalBytes).toString("utf8")) as {
        plaintext: string;
      };
      return Buffer.from(payload.plaintext, "base64");
    }

    if (!keys) {
      throw new Error("subscriber keys required for private stream signals");
    }
    if (!meta.keyboxPointer) {
      throw new Error("keybox pointer missing for private signal");
    }

    const keyboxPointer = this.pointerFromId(meta.keyboxPointer);
    const keyboxBytes = await this.storage.getKeybox(keyboxPointer);
    const parsed = JSON.parse(Buffer.from(keyboxBytes).toString("utf8")) as
      | WrappedKey[]
      | Record<string, WrappedKey>;

    const subscriberId = subscriberIdFromPubkey(Buffer.from(keys.publicKeyDerBase64, "base64"));
    const entry = Array.isArray(parsed)
      ? parsed.find((k) => k.subscriberId === subscriberId)
      : parsed[subscriberId];
    if (!entry) {
      throw new Error("subscriber key not found in keybox");
    }

    const symKey = unwrapKeyForSubscriber(
      Buffer.from(keys.privateKeyDerBase64, "base64"),
      entry
    );

    const signalPointer = this.pointerFromId(meta.signalPointer);
    const signalBytes = await this.storage.getCiphertext(signalPointer);

    if (sha256Hex(signalBytes) !== meta.signalHash) {
      throw new Error("signal hash mismatch");
    }

    const payload = JSON.parse(Buffer.from(signalBytes).toString("utf8")) as {
      iv: string;
      tag: string;
      ciphertext: string;
    };

    return decryptSignal(
      Buffer.from(payload.ciphertext, "base64"),
      symKey,
      Buffer.from(payload.iv, "base64"),
      Buffer.from(payload.tag, "base64")
    );
  }

  private pointerFromId(id: string): StoragePointer {
    const parts = id.split("/");
    const sha = parts[parts.length - 1];
    return { id, sha256: sha };
  }
}

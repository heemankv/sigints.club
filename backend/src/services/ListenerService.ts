import { SignalStore } from "../signals/SignalStore";
import { SignalMetadata } from "../metadata/MetadataStore";
import { sha256Hex } from "../utils/hash";
import { stableStringify } from "../utils/json";
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
  constructor(private signals: SignalStore) {}

  async decryptLatestSignal(meta: SignalMetadata, keys?: SubscriberKeys): Promise<Buffer> {
    if (meta.visibility === "public") {
      const payload = await this.signals.getPayloadByHash(meta.signalHash);
      if (!payload || !("plaintext" in payload)) {
        throw new Error("public payload not found");
      }
      const payloadBytes = Buffer.from(stableStringify(payload));
      if (sha256Hex(payloadBytes) !== meta.signalHash) {
        throw new Error("signal hash mismatch");
      }
      return Buffer.from(payload.plaintext, "base64");
    }

    if (!keys) {
      throw new Error("subscriber keys required for private stream signals");
    }
    if (!meta.keyboxPointer) {
      throw new Error("keybox pointer missing for private signal");
    }
    if (!meta.keyboxHash) {
      throw new Error("keybox hash missing for private signal");
    }

    const parsed = (await this.signals.getKeyboxByHash(meta.keyboxHash)) as
      | WrappedKey[]
      | Record<string, WrappedKey>
      | null;
    if (!parsed) {
      throw new Error("keybox not found");
    }

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

    const payload = await this.signals.getPayloadByHash(meta.signalHash);
    if (!payload || !("ciphertext" in payload)) {
      throw new Error("ciphertext payload not found");
    }
    const payloadBytes = Buffer.from(stableStringify(payload));
    if (sha256Hex(payloadBytes) !== meta.signalHash) {
      throw new Error("signal hash mismatch");
    }

    return decryptSignal(
      Buffer.from(payload.ciphertext, "base64"),
      symKey,
      Buffer.from(payload.iv, "base64"),
      Buffer.from(payload.tag, "base64")
    );
  }
}

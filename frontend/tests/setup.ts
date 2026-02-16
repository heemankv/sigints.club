import "@testing-library/jest-dom";
import { webcrypto } from "node:crypto";

if (!globalThis.crypto) {
  // @ts-expect-error test shim
  globalThis.crypto = webcrypto;
}

import { TapestryClient } from "./TapestryClient";
import { MockTapestryClient } from "./mock";

export function getTapestryClient() {
  if (process.env.TAPESTRY_MOCK === "true" || process.env.NODE_ENV === "test") {
    return new MockTapestryClient();
  }
  const apiKey = process.env.TAPESTRY_API_KEY;
  if (!apiKey) {
    throw new Error("TAPESTRY_API_KEY not set");
  }
  const baseURL = process.env.TAPESTRY_BASE_URL;
  return new TapestryClient({ apiKey, baseURL });
}

import { TapestryClient } from "./TapestryClient";

export function getTapestryClient() {
  const apiKey = process.env.TAPESTRY_API_KEY;
  if (!apiKey) {
    throw new Error("TAPESTRY_API_KEY not set");
  }
  const baseURL = process.env.TAPESTRY_BASE_URL;
  return new TapestryClient({ apiKey, baseURL });
}

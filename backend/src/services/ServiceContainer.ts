import { getDb } from "../db";
import { SqlSignalStore } from "../signals";
import { SignalService } from "./SignalService";
import { DiscoveryService } from "./DiscoveryService";
import { StreamRegistryClient } from "./StreamRegistryClient";
import { ListenerService } from "./ListenerService";
import { OnChainSubscriptionClient } from "./OnChainSubscriptionClient";
import {
  SqlUserStore,
  SqlBotStore,
  SqlSubscriptionStore,
} from "../social";
import { TapestryPublisher } from "../tapestry/TapestryPublisher";
import { getTapestryClient } from "../tapestry";
import { SocialService } from "./SocialService";
import { TapestryStreamService } from "./TapestryStreamService";

const solanaProgramId = process.env.SOLANA_SUBSCRIPTION_PROGRAM_ID;
const solanaKeypairPath = process.env.SOLANA_KEYPAIR;
const solanaSecretKey = solanaKeypairPath ? undefined : process.env.SOLANA_PRIVATE_KEY;
const solanaRpcUrl = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const solanaIdlPath = process.env.SOLANA_IDL_PATH;
const solanaStreamMap = parseStreamMap(process.env.SOLANA_STREAM_MAP);
const tapestryProfileMap = parseStreamMap(process.env.TAPESTRY_PROFILE_MAP);
const tapestryRegistryProfileId = process.env.TAPESTRY_REGISTRY_PROFILE_ID;
const solanaStreamDefault = process.env.SOLANA_STREAM_DEFAULT;
const solanaStreamRegistryId = process.env.SOLANA_STREAM_REGISTRY_PROGRAM_ID;

const db = getDb();
const signalStore = new SqlSignalStore(db);
const streamRegistryInstance = solanaStreamRegistryId
  ? new StreamRegistryClient({
      rpcUrl: solanaRpcUrl,
      programId: solanaStreamRegistryId,
    })
  : undefined;
const listener = new ListenerService(signalStore);
const userStore = new SqlUserStore(db);
const botStore = new SqlBotStore(db);
const subscriptionStore = new SqlSubscriptionStore(db);

const client = getTapestryClient();
const tapestryStreamService = new TapestryStreamService(client, tapestryRegistryProfileId);

const onChainSubscriptions =
  solanaProgramId && (solanaKeypairPath || solanaSecretKey)
    ? new OnChainSubscriptionClient({
        rpcUrl: solanaRpcUrl,
        keypairPath: solanaKeypairPath,
        secretKeyBase58: solanaSecretKey,
        programId: solanaProgramId,
        streamRegistryProgramId: solanaStreamRegistryId,
        streamMap: solanaStreamMap,
        streamDefault: solanaStreamDefault,
      })
    : undefined;

const socialPublisher = new TapestryPublisher(
  client,
  process.env.TAPESTRY_PROFILE_ID,
  tapestryProfileMap,
  tapestryStreamService
);
const socialService = new SocialService(client, userStore);

const discovery = new DiscoveryService(streamRegistryInstance, tapestryStreamService);

export const signalService = new SignalService(signalStore, socialPublisher);
export { signalStore };
export const discoveryService = discovery;
export const streamRegistry = streamRegistryInstance;
export const listenerService = listener;
export const onChainSubscriptionClient = onChainSubscriptions;
export const userProfileStore = userStore;
export const botProfileStore = botStore;
export const subscriptionProfileStore = subscriptionStore;
export const socialServiceInstance = socialService;
export const tapestryStreamServiceInstance = tapestryStreamService;
export const tapestryClient = client;

function parseStreamMap(value?: string): Record<string, string> | undefined {
  if (!value) {
    return undefined;
  }
  try {
    return JSON.parse(value) as Record<string, string>;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("Invalid SOLANA_STREAM_MAP JSON, ignoring.", error);
    return undefined;
  }
}

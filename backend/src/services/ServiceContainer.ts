import { BackendStorage } from "../storage/providers/BackendStorage";
import { getStorageProvider } from "../storage";
import { InMemoryMetadata } from "../metadata/providers/InMemoryMetadata";
import { FileMetadata } from "../metadata/providers/FileMetadata";
import { SignalService } from "./SignalService";
import { InMemorySubscriberDirectory } from "./InMemorySubscriberDirectory";
import { FileSubscriberDirectory } from "./FileSubscriberDirectory";
import { DiscoveryService } from "./DiscoveryService";
import { StreamRegistryClient } from "./StreamRegistryClient";
import { ListenerService } from "./ListenerService";
import { OnChainStub } from "./OnChainStub";
import { OnChainAnchorRecorder } from "./OnChainAnchorRecorder";
import { OnChainSubscriptionClient } from "./OnChainSubscriptionClient";
import {
  FileUserStore,
  FileBotStore,
  FileSubscriptionStore,
  InMemoryUserStore,
  InMemoryBotStore,
  InMemorySubscriptionStore,
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

const storage = process.env.STORAGE_KIND === "da" ? getStorageProvider("da") : new BackendStorage();
const persist = process.env.PERSIST === "true" || process.env.NODE_ENV !== "test";
const metadata = persist ? new FileMetadata() : new InMemoryMetadata();
const subscribers = persist ? new FileSubscriberDirectory() : new InMemorySubscriberDirectory();
const streamRegistryInstance = solanaStreamRegistryId
  ? new StreamRegistryClient({
      rpcUrl: solanaRpcUrl,
      programId: solanaStreamRegistryId,
    })
  : undefined;
const listener = new ListenerService(storage);
const userStore = persist ? new FileUserStore() : new InMemoryUserStore();
const botStore = persist ? new FileBotStore() : new InMemoryBotStore();
const subscriptionStore = persist ? new FileSubscriptionStore() : new InMemorySubscriptionStore();

const client = getTapestryClient();
const tapestryStreamService = new TapestryStreamService(client, tapestryRegistryProfileId);

const onChainRecorder =
  solanaProgramId && (solanaKeypairPath || solanaSecretKey)
    ? new OnChainAnchorRecorder({
        rpcUrl: solanaRpcUrl,
        keypairPath: solanaKeypairPath,
        secretKeyBase58: solanaSecretKey,
        programId: solanaProgramId,
        idlPath: solanaIdlPath,
        streamMap: solanaStreamMap,
        streamDefault: solanaStreamDefault,
        streamRegistryProgramId: solanaStreamRegistryId,
      })
    : new OnChainStub();

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
socialService.startBackgroundRefresh(15_000); // poll Tapestry feed every 15 s

const discovery = new DiscoveryService(streamRegistryInstance, tapestryStreamService);
discovery.startBackgroundRefresh(20_000); // poll Tapestry streams every 20 s

export const signalService = new SignalService(storage, metadata, socialPublisher, onChainRecorder);
export const metadataStore = metadata;
export const subscriberDirectory = subscribers;
export const discoveryService = discovery;
export const streamRegistry = streamRegistryInstance;
export const listenerService = listener;
export const storageProvider = storage;
export const onChainSubscriptionClient = onChainSubscriptions;
export const userProfileStore = userStore;
export const botProfileStore = botStore;
export const subscriptionProfileStore = subscriptionStore;
export const socialServiceInstance = socialService;
export const tapestryStreamServiceInstance = tapestryStreamService;

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

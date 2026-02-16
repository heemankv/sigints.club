import { BackendStorage } from "../storage/providers/BackendStorage";
import { getStorageProvider } from "../storage";
import { InMemoryMetadata } from "../metadata/providers/InMemoryMetadata";
import { FileMetadata } from "../metadata/providers/FileMetadata";
import { SignalService } from "./SignalService";
import { InMemorySubscriberDirectory } from "./InMemorySubscriberDirectory";
import { FileSubscriberDirectory } from "./FileSubscriberDirectory";
import { DiscoveryService } from "./DiscoveryService";
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
  FileSocialPostStore,
  InMemorySocialPostStore,
} from "../social";
import { TapestryPublisher } from "../tapestry/TapestryPublisher";
import { getTapestryClient } from "../tapestry";
import { SocialService } from "./SocialService";

const solanaProgramId = process.env.SOLANA_SUBSCRIPTION_PROGRAM_ID;
const solanaKeypairPath = process.env.SOLANA_KEYPAIR;
const solanaSecretKey = solanaKeypairPath ? undefined : process.env.SOLANA_PRIVATE_KEY;
const solanaRpcUrl = process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const solanaIdlPath = process.env.SOLANA_IDL_PATH;
const solanaPersonaMap = parsePersonaMap(process.env.SOLANA_PERSONA_MAP);
const tapestryProfileMap = parsePersonaMap(process.env.TAPESTRY_PROFILE_MAP);
const solanaPersonaDefault = process.env.SOLANA_PERSONA_DEFAULT;

const storage = process.env.STORAGE_KIND === "da" ? getStorageProvider("da") : new BackendStorage();
const persist = process.env.PERSIST === "true" || process.env.NODE_ENV !== "test";
const metadata = persist ? new FileMetadata() : new InMemoryMetadata();
const subscribers = persist ? new FileSubscriberDirectory() : new InMemorySubscriberDirectory();
const discovery = new DiscoveryService(solanaPersonaMap, tapestryProfileMap);
const listener = new ListenerService(storage);
const userStore = persist ? new FileUserStore() : new InMemoryUserStore();
const botStore = persist ? new FileBotStore() : new InMemoryBotStore();
const subscriptionStore = persist ? new FileSubscriptionStore() : new InMemorySubscriptionStore();
const socialPostStore = persist ? new FileSocialPostStore() : new InMemorySocialPostStore();

const onChainRecorder =
  solanaProgramId && (solanaKeypairPath || solanaSecretKey)
    ? new OnChainAnchorRecorder({
        rpcUrl: solanaRpcUrl,
        keypairPath: solanaKeypairPath,
        secretKeyBase58: solanaSecretKey,
        programId: solanaProgramId,
        idlPath: solanaIdlPath,
        personaMap: solanaPersonaMap,
        personaDefault: solanaPersonaDefault,
      })
    : new OnChainStub();

const onChainSubscriptions =
  solanaProgramId && (solanaKeypairPath || solanaSecretKey)
    ? new OnChainSubscriptionClient({
        rpcUrl: solanaRpcUrl,
        keypairPath: solanaKeypairPath,
        secretKeyBase58: solanaSecretKey,
        programId: solanaProgramId,
        personaMap: solanaPersonaMap,
        personaDefault: solanaPersonaDefault,
      })
    : undefined;

let socialPublisher: TapestryPublisher | undefined;
let socialService: SocialService | undefined;
if (process.env.TAPESTRY_API_KEY) {
  const client = getTapestryClient();
  socialPublisher = new TapestryPublisher(client, process.env.TAPESTRY_PROFILE_ID, tapestryProfileMap);
  socialService = new SocialService(client, socialPostStore, userStore);
}

export const signalService = new SignalService(storage, metadata, socialPublisher, onChainRecorder);
export const metadataStore = metadata;
export const subscriberDirectory = subscribers;
export const discoveryService = discovery;
export const listenerService = listener;
export const storageProvider = storage;
export const onChainSubscriptionClient = onChainSubscriptions;
export const userProfileStore = userStore;
export const botProfileStore = botStore;
export const subscriptionProfileStore = subscriptionStore;
export const socialPostStoreInstance = socialPostStore;
export const socialServiceInstance = socialService;

function parsePersonaMap(value?: string): Record<string, string> | undefined {
  if (!value) {
    return undefined;
  }
  try {
    return JSON.parse(value) as Record<string, string>;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("Invalid SOLANA_PERSONA_MAP JSON, ignoring.", error);
    return undefined;
  }
}

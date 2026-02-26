import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

type JetstreamUpdate = {
  account?: {
    address?: string;
    owner?: string;
    lamports?: number | string;
    data?: Buffer | Uint8Array;
    created_at?: unknown;
    is_startup?: boolean;
    slot?: number | string;
  };
  transaction?: unknown;
  ping?: unknown;
  pong?: unknown;
};

export type JetstreamAccountUpdate = {
  address?: string;
  owner?: string;
  lamports?: number;
  data: Buffer;
  slot?: number;
  isStartup?: boolean;
};

export type JetstreamSubscription = {
  close: () => void;
};

export type JetstreamAccountListenerParams = {
  endpoint: string;
  apiKey?: string;
  apiKeyHeader?: string;
  accountPubkey: string;
  pingIntervalMs?: number;
  onAccount: (update: JetstreamAccountUpdate) => void | Promise<void>;
  onError?: (error: Error) => void;
};

const DEFAULT_PING_INTERVAL_MS = 25_000;
const DEFAULT_API_HEADER = "X-ORBIT-KEY";

type JetstreamStream = {
  write: (data: unknown) => void;
  end: () => void;
  on: (event: string, listener: (...args: any[]) => void) => void;
};

type JetstreamClient = {
  subscribe?: (metadata?: any) => JetstreamStream;
  Subscribe?: (metadata?: any) => JetstreamStream;
};

function normalizeEndpoint(endpoint: string): { address: string; secure: boolean } {
  const trimmed = endpoint.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    const url = new URL(trimmed);
    return {
      address: url.host,
      secure: url.protocol === "https:",
    };
  }
  const secure = trimmed.endsWith(":443");
  return { address: trimmed, secure };
}

export async function startJetstreamAccountListener(
  params: JetstreamAccountListenerParams
): Promise<JetstreamSubscription> {
  const { endpoint, apiKey, apiKeyHeader, accountPubkey, pingIntervalMs, onAccount, onError } = params;
  const require = createRequire(import.meta.url);
  // Dynamic import to keep gRPC out of browser bundles.
  const grpc = await import("@grpc/grpc-js");
  const protoLoader = await import("@grpc/proto-loader");

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const protoPath = path.join(__dirname, "jetstream.proto");
  const protobufRoot = path.dirname(require.resolve("protobufjs/package.json"));

  const packageDefinition = protoLoader.loadSync(protoPath, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
    includeDirs: [__dirname, protobufRoot],
  });

  const descriptor = grpc.loadPackageDefinition(packageDefinition) as any;
  const JetstreamService = descriptor?.jetstream?.Jetstream;
  if (!JetstreamService) {
    throw new Error("Jetstream service not found in proto");
  }

  const { address, secure } = normalizeEndpoint(endpoint);
  const credentials = secure ? grpc.credentials.createSsl() : grpc.credentials.createInsecure();
  const client: JetstreamClient = new JetstreamService(address, credentials, {
    "grpc.max_receive_message_length": 64 * 1024 * 1024,
  });

  const metadata = new grpc.Metadata();
  if (apiKey) {
    metadata.set((apiKeyHeader ?? DEFAULT_API_HEADER).toLowerCase(), apiKey);
  }

  const subscribeFn = client.subscribe ?? client.Subscribe;
  if (!subscribeFn) {
    throw new Error("Jetstream client missing subscribe method");
  }
  const stream = subscribeFn.call(client, metadata) as JetstreamStream;

  const request = {
    transactions: {},
    accounts: {
      signals: {
        account: [accountPubkey],
      },
    },
  };

  stream.write(request);

  const pingInterval = setInterval(() => {
    try {
      stream.write({
        transactions: {},
        accounts: {},
        ping: { id: Date.now() % 2147483647 },
      });
    } catch (err: any) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  }, pingIntervalMs ?? DEFAULT_PING_INTERVAL_MS);

  stream.on("data", async (update: JetstreamUpdate) => {
    if (!update?.account?.data) return;
    try {
      const data = Buffer.isBuffer(update.account.data)
        ? update.account.data
        : Buffer.from(update.account.data);
      const slotRaw = update.account.slot;
      const slot = slotRaw !== undefined ? Number(slotRaw) : undefined;
      const lamportsRaw = update.account.lamports;
      const lamports = lamportsRaw !== undefined ? Number(lamportsRaw) : undefined;
      await onAccount({
        address: update.account.address,
        owner: update.account.owner,
        lamports,
        data,
        slot: Number.isFinite(slot) ? slot : undefined,
        isStartup: update.account.is_startup,
      });
    } catch (err: any) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  });

  stream.on("error", (err: Error) => {
    onError?.(err);
  });

  const close = () => {
    clearInterval(pingInterval);
    try {
      stream.end();
    } catch {
      // ignore close errors
    }
  };

  return { close };
}

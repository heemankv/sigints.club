import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { clearMetrics } from "./helpers/metrics";
import { Connection, Keypair } from "@solana/web3.js";

const ROOT = path.resolve(__dirname, "../../..");
const STATE_DIR = path.join(ROOT, ".tmp");
const STATE_PATH = path.join(STATE_DIR, "e2e-processes.json");
const LOG_PATH = path.join(ROOT, ".logs/e2e-setup.log");

function log(message: string) {
  fs.mkdirSync(path.join(ROOT, ".logs"), { recursive: true });
  fs.appendFileSync(LOG_PATH, `[${new Date().toISOString()}] ${message}\n`);
}

async function waitForRpc(timeoutMs = 180_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch("http://127.0.0.1:8899", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json?.result === "ok" || json?.error?.code === -32601 || json?.result) {
          return;
        }
      }
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Localnet RPC did not become healthy in time");
}

async function waitForHttp(url: string, timeoutMs = 240_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status < 500) {
        return;
      }
    } catch {
      // ignore
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Service ${url} did not become ready in time`);
}

async function waitForFile(filePath: string, timeoutMs = 240_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (fs.existsSync(filePath)) {
      return;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`File ${filePath} did not appear in time`);
}

async function waitForPrograms(timeoutMs = 240_000) {
  const rpcUrl = "http://127.0.0.1:8899";
  const connection = new Connection(rpcUrl, "confirmed");
  const keypairs = [
    path.join(ROOT, "target/deploy/stream_registry-keypair.json"),
    path.join(ROOT, "target/deploy/subscription_royalty-keypair.json"),
    path.join(ROOT, "target/deploy/challenge_slashing-keypair.json"),
  ];
  const programIds = keypairs
    .filter((kp) => fs.existsSync(kp))
    .map((kp) => {
      const raw = JSON.parse(fs.readFileSync(kp, "utf8"));
      return Keypair.fromSecretKey(Uint8Array.from(raw)).publicKey;
    });
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    let ready = 0;
    for (const programId of programIds) {
      const info = await connection.getAccountInfo(programId);
      if (info?.executable) {
        ready += 1;
      }
    }
    if (ready === programIds.length && programIds.length > 0) {
      return;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("Program deploys did not become executable in time");
}

function spawnScript(script: string, args: string[]) {
  log(`Spawning ${script} ${args.join(" ")}`);
  const child = spawn(script, args, {
    cwd: ROOT,
    detached: true,
    stdio: "ignore",
    env: { ...process.env },
  });
  if (!child.pid) {
    throw new Error(`Failed to spawn ${script}`);
  }
  child.unref();
  return child.pid;
}

export default async function globalSetup() {
  log("Global setup starting");
  clearMetrics();
  fs.mkdirSync(STATE_DIR, { recursive: true });

  const chainPid = spawnScript(path.join(ROOT, "scripts/run-chain.sh"), ["--fresh", "--deploy"]);
  log(`run-chain started pid=${chainPid}`);
  await waitForRpc();
  log("Localnet RPC ready");

  await waitForFile(path.join(ROOT, "backend/idl/stream_registry.json"));
  await waitForFile(path.join(ROOT, "backend/idl/subscription_royalty.json"));
  await waitForFile(path.join(ROOT, "backend/idl/challenge_slashing.json"));
  log("IDL artifacts available");
  await waitForPrograms();
  log("Programs executable on-chain");

  const appPid = spawnScript(path.join(ROOT, "scripts/run-app.sh"), ["--demo"]);
  log(`run-app started pid=${appPid}`);
  await waitForHttp("http://127.0.0.1:3001/health", 240_000);
  await waitForHttp("http://127.0.0.1:3000", 240_000);
  log("Backend + frontend healthy");

  fs.writeFileSync(
    STATE_PATH,
    JSON.stringify({ chainPid, appPid, startedAt: Date.now() }, null, 2)
  );
  log("Global setup completed");
}

import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export function loadEnv() {
  const dir = dirname(fileURLToPath(import.meta.url));
  config({ path: join(dir, ".env") });
}

export function parseArgs(argv = process.argv.slice(2)) {
  const map = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg || !arg.startsWith("--")) continue;
    const raw = arg.slice(2);
    if (!raw) continue;
    const [key, inline] = raw.split("=");
    if (inline !== undefined) {
      map.set(key, inline);
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      map.set(key, next);
      i += 1;
      continue;
    }
    map.set(key, "true");
  }
  return map;
}

export function getArg(map, key, fallback) {
  return map.get(key) ?? fallback;
}

export function requireArg(map, key, fallback, envName) {
  const value = getArg(map, key, fallback);
  if (!value || value === "true") {
    const label = envName ? `${envName} or --${key}` : `--${key}`;
    throw new Error(`Missing ${label}.`);
  }
  return value;
}

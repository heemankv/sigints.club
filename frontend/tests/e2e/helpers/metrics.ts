import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../../../..");
const ARTIFACT_DIR = path.join(ROOT, "frontend/tests/e2e/.artifacts");
const METRICS_PATH = path.join(ARTIFACT_DIR, "metrics.json");

export type MetricEntry = {
  name: string;
  ms: number;
  meta?: Record<string, string | number | boolean | null>;
  timestamp: string;
};

export function recordMetric(entry: Omit<MetricEntry, "timestamp">) {
  const payload: MetricEntry = { ...entry, timestamp: new Date().toISOString() };
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const existing = readMetrics();
  existing.push(payload);
  fs.writeFileSync(METRICS_PATH, JSON.stringify(existing, null, 2));
}

export function readMetrics(): MetricEntry[] {
  if (!fs.existsSync(METRICS_PATH)) return [];
  try {
    const raw = fs.readFileSync(METRICS_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function clearMetrics() {
  if (fs.existsSync(METRICS_PATH)) {
    fs.unlinkSync(METRICS_PATH);
  }
}

import fs from "node:fs";
import path from "node:path";
import { readMetrics } from "./helpers/metrics";

const ROOT = path.resolve(__dirname, "../../..");
const STATE_PATH = path.join(ROOT, ".tmp", "e2e-processes.json");
const REPORT_PATH = path.join(ROOT, "documents/E2E_Strict_Test_Report.md");
const LOG_PATH = path.join(ROOT, ".logs/e2e-setup.log");

function log(message: string) {
  fs.mkdirSync(path.join(ROOT, ".logs"), { recursive: true });
  fs.appendFileSync(LOG_PATH, `[${new Date().toISOString()}] ${message}\n`);
}

function killProcess(pid?: number) {
  if (!pid) return;
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // ignore
    }
  }
}

function extractTapestryFailures(logPath: string): string[] {
  if (!fs.existsSync(logPath)) return [];
  const lines = fs.readFileSync(logPath, "utf8").split(/\r?\n/);
  return lines.filter((line) => /tapestry/i.test(line) && /error|fail|timeout|500/i.test(line));
}

function formatMetrics(metrics: { name: string; ms: number; meta?: Record<string, any> }[]) {
  if (!metrics.length) return "No timing metrics recorded.";
  const sorted = [...metrics].sort((a, b) => b.ms - a.ms);
  const rows = sorted.map((entry) => {
    const meta = entry.meta ? ` (${JSON.stringify(entry.meta)})` : "";
    return `- ${entry.name}: ${entry.ms}ms${meta}`;
  });
  return rows.join("\n");
}

export default async function globalTeardown() {
  log("Global teardown starting");
  if (fs.existsSync(STATE_PATH)) {
    const raw = fs.readFileSync(STATE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    killProcess(parsed.chainPid);
    killProcess(parsed.appPid);
    fs.unlinkSync(STATE_PATH);
    log(`Stopped processes chain=${parsed.chainPid} app=${parsed.appPid}`);
  }

  const metrics = readMetrics();
  const tapestryFromBackend = extractTapestryFailures(path.join(ROOT, ".logs/backend.log"));
  const tapestryFromSeed = extractTapestryFailures(path.join(ROOT, ".logs/seed.log"));
  const tapestryFailures = [...new Set([...tapestryFromBackend, ...tapestryFromSeed])];

  const report = [
    "# E2E Strict Test Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Timing Notes",
    formatMetrics(metrics),
    "",
    "## Tapestry Failures",
    tapestryFailures.length ? tapestryFailures.map((line) => `- ${line}`).join("\n") : "No Tapestry failures detected in logs.",
    "",
    "## Artifacts",
    `- Playwright report: ${path.join(ROOT, "frontend/playwright-report")}`,
    `- Playwright test results: ${path.join(ROOT, "frontend/test-results")}`,
    `- Metrics: ${path.join(ROOT, "frontend/tests/e2e/.artifacts/metrics.json")}`,
    "",
  ].join("\n");

  fs.writeFileSync(REPORT_PATH, report);
  log("Global teardown completed");
}

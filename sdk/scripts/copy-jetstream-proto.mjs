import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const src = path.resolve(__dirname, "..", "src", "jetstream.proto");
const destDir = path.resolve(__dirname, "..", "dist");
const dest = path.join(destDir, "jetstream.proto");

if (!fs.existsSync(src)) {
  console.error("jetstream.proto not found:", src);
  process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log("Copied jetstream.proto to dist.");

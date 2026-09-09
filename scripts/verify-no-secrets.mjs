// Scans the built client bundle for anything that looks like a server secret.
// Run after `npm run build`. Exits non-zero on any hit.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

const STATIC = path.join(process.cwd(), ".next", "static");
if (!existsSync(STATIC)) {
  console.error("No .next/static — run `npm run build` first.");
  process.exit(1);
}

const SECRET_ENV = [
  "AUTH_SECRET", "CRON_SECRET", "ANTHROPIC_API_KEY", "FRED_API_KEY", "NEWSAPI_KEY",
  "FMP_API_KEY", "POLYGON_API_KEY", "TIINGO_API_KEY", "FINNHUB_API_KEY", "TWELVEDATA_API_KEY",
];

// literal values from .env (if present)
const values = [];
if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*"?([^"\n]+)"?/);
    if (m && SECRET_ENV.includes(m[1]) && m[2].trim().length >= 8) values.push({ name: m[1], value: m[2].trim() });
  }
}

const NAME_RE = new RegExp(`process\\.env\\.(${SECRET_ENV.join("|")})`);
const KEY_RE = /sk-ant-[a-zA-Z0-9_-]{6,}/;

function* walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (p.endsWith(".js")) yield p;
  }
}

let hits = 0;
for (const file of walk(STATIC)) {
  const text = readFileSync(file, "utf8");
  const rel = path.relative(process.cwd(), file);
  if (NAME_RE.test(text)) {
    console.error(`❌ ${rel}: references a server secret env var (${text.match(NAME_RE)[1]})`);
    hits++;
  }
  if (KEY_RE.test(text)) {
    console.error(`❌ ${rel}: contains something matching an Anthropic key pattern`);
    hits++;
  }
  for (const { name, value } of values) {
    if (text.includes(value)) {
      console.error(`❌ ${rel}: contains the literal value of ${name} from .env`);
      hits++;
    }
  }
}

if (hits > 0) {
  console.error(`\n${hits} potential secret leak(s) in the client bundle.`);
  process.exit(1);
}
console.log("Client bundle clean — no server secrets found. ✔");

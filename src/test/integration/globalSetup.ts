import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const SIDECAR = path.join(process.cwd(), ".vitest-it-db");

export default function setup() {
  // PostgreSQL CI job: the DB + migrations are already provisioned; just record
  // the provided URL for the workers and do nothing else.
  if ((process.env.DATABASE_PROVIDER ?? "sqlite") === "postgresql" && process.env.DATABASE_URL) {
    writeFileSync(SIDECAR, process.env.DATABASE_URL);
    return () => rmSync(SIDECAR, { force: true });
  }

  const dir = mkdtempSync(path.join(tmpdir(), "gis-it-"));
  const dbFile = path.join(dir, "test.db");
  const dbUrl = `file:${dbFile}`;

  process.env.DATABASE_URL = dbUrl;
  process.env.DATABASE_PROVIDER = "sqlite";
  writeFileSync(SIDECAR, dbUrl);

  const res = spawnSync("prisma", ["migrate", "deploy"], {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, DATABASE_URL: dbUrl },
  });
  if (res.status !== 0) throw new Error("integration setup: prisma migrate deploy failed");

  return () => {
    try {
      rmSync(dir, { recursive: true, force: true });
      rmSync(SIDECAR, { force: true });
    } catch {
      /* ignore */
    }
  };
}

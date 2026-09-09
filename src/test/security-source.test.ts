import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "src");
const SECRET_NAMES = ["AUTH_SECRET", "CRON_SECRET", "ANTHROPIC_API_KEY", "FRED_API_KEY", "NEWSAPI_KEY", "FMP_API_KEY"];

function* walk(dir: string): Generator<string> {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx)$/.test(p)) yield p;
  }
}

const files = [...walk(SRC)];

describe("security — source hygiene", () => {
  it("no NEXT_PUBLIC_ env var carries a secret name", () => {
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      for (const s of SECRET_NAMES) {
        expect(text.includes(`NEXT_PUBLIC_${s}`), `${f} references NEXT_PUBLIC_${s}`).toBe(false);
      }
    }
  });

  it('"use client" components never read a server secret env var', () => {
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      const isClient = /^["']use client["']/m.test(text.slice(0, 200));
      if (!isClient) continue;
      for (const s of SECRET_NAMES) {
        expect(text.includes(`process.env.${s}`), `client component ${f} reads process.env.${s}`).toBe(false);
      }
      // client components must not VALUE-import the server-only db / auth / ai
      // client / services (type-only imports are erased and are fine).
      for (const bad of ["@/lib/db", "@/lib/auth", "@/ai/client", "@/services/"]) {
        const valueImport = new RegExp(`(?<!import type )(?<!, type )\\bfrom ["']${bad.replace(/\//g, "\\/")}`);
        const lines = text.split("\n").filter((l) => l.includes(`from "${bad}`) || l.includes(`from '${bad}`));
        for (const l of lines) {
          expect(/import\s+type\b/.test(l), `client component ${f} value-imports ${bad}: ${l.trim()}`).toBe(true);
        }
        void valueImport;
      }
    }
  });

  it("no hard-coded Anthropic key anywhere in source", () => {
    for (const f of files) {
      expect(/sk-ant-[a-zA-Z0-9]/.test(readFileSync(f, "utf8")), `${f}`).toBe(false);
    }
  });
});

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CompareSelector({ versions }: { versions: number[] }) {
  const router = useRouter();
  const sorted = [...versions].sort((a, b) => a - b);
  const [a, setA] = useState(sorted[Math.max(0, sorted.length - 2)]);
  const [b, setB] = useState(sorted[sorted.length - 1]);

  const sel =
    "rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-sm";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select className={sel} value={a} onChange={(e) => setA(Number(e.target.value))}>
        {sorted.map((v) => (
          <option key={v} value={v}>
            v{v}
          </option>
        ))}
      </select>
      <span className="text-[var(--color-muted)]">→</span>
      <select className={sel} value={b} onChange={(e) => setB(Number(e.target.value))}>
        {sorted.map((v) => (
          <option key={v} value={v}>
            v{v}
          </option>
        ))}
      </select>
      <button
        onClick={() => router.push(`/history/compare?a=${a}&b=${b}`)}
        disabled={a === b}
        className="rounded-md bg-[var(--color-accent)] px-3 py-1 text-sm font-semibold text-white disabled:opacity-50"
      >
        Compare
      </button>
    </div>
  );
}

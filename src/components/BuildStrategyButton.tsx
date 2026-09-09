"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function BuildStrategyButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function build() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/strategy/generate", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMsg("Strategy built.");
        router.refresh();
      } else {
        setMsg(data.error ?? `Failed (${res.status})`);
      }
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        onClick={build}
        disabled={busy}
        className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {busy ? "Building… (up to a minute)" : "Build my strategy"}
      </button>
      {msg && <p className="text-xs text-[var(--color-muted)]">{msg}</p>}
    </div>
  );
}

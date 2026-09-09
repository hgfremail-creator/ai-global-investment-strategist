"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RunButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/weekly/run", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.ok) {
      setMsg(`Generated strategy v${data.version} for the week of ${data.weekOf}.`);
      router.refresh();
    } else {
      setMsg(data.error ?? "Failed");
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={run}
        disabled={busy}
        className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
      >
        {busy ? "Running review…" : "Run weekly review now"}
      </button>
      {msg && <span className="text-xs text-[var(--color-muted)]">{msg}</span>}
    </div>
  );
}

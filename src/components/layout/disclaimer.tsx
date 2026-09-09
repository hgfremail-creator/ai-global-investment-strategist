"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const KEY = "gis_disclaimer_ack_v1";

export function DisclaimerGate() {
  const [ack, setAck] = useState(true); // assume acked to avoid flash; correct on mount

  useEffect(() => {
    try {
      setAck(localStorage.getItem(KEY) === "1");
    } catch {
      setAck(false);
    }
  }, []);

  if (ack) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="card max-w-lg space-y-4 p-6">
        <h2 className="text-base font-semibold">Before you continue — please read</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-[var(--color-muted)]">
          <li>This is an <strong className="text-[var(--color-fg)]">AI-powered research and portfolio-analysis tool</strong>. It is not personalised investment advice and it is not a broker.</li>
          <li>All trading here is <strong className="text-[var(--color-fg)]">simulated (paper) investing</strong>. No real orders are placed.</li>
          <li><strong className="text-[var(--color-fg)]">Investments involve risk. You can lose capital.</strong> Past performance does not guarantee future results.</li>
          <li>Recommendations are based only on the information available to the app. Review the sources and assumptions shown with every recommendation.</li>
          <li>The app does not guarantee any investment outcome. Market and demo data may be delayed or simulated.</li>
        </ul>
        <p className="text-xs text-[var(--color-faint)]">
          Full terms and methodology: <Link className="text-[var(--color-accent)]" href="/legal">/legal</Link>
        </p>
        <button
          onClick={() => {
            try {
              localStorage.setItem(KEY, "1");
            } catch {
              /* ignore */
            }
            setAck(true);
          }}
          className="w-full rounded-md bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-white"
        >
          I understand — continue
        </button>
      </div>
    </div>
  );
}

export function DisclaimerBanner() {
  return (
    <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-1.5 text-center text-[11px] text-[var(--color-muted)]">
      Research &amp; portfolio-analysis tool · paper investing only · not investment advice ·
      investments can lose value ·{" "}
      <Link className="text-[var(--color-accent)]" href="/legal">
        details
      </Link>
    </div>
  );
}

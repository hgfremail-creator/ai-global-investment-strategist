"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CURRENCIES,
  HORIZONS,
  HORIZON_LABELS,
  OBJECTIVES,
  OBJECTIVE_LABELS,
  RISK_LABELS,
  RISK_SCORES,
  type Currency,
  type Horizon,
  type Objective,
  type RiskScore,
} from "@/lib/enums";
import { cx } from "@/components/ui";
import type { FxQuote } from "@/data/fx";

type ExistingPos = { ticker: string; quantity: string; avgPrice: string };

export function OnboardingWizard({ fxRates }: { fxRates: FxQuote[] }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [amount, setAmount] = useState("100000");
  const [currency, setCurrency] = useState<Currency>("USD");
  const [risk, setRisk] = useState<RiskScore>(3);
  const [horizon, setHorizon] = useState<Horizon>("Y5_10");
  const [objective, setObjective] = useState<Objective>("BALANCED_GROWTH");
  const [positions, setPositions] = useState<ExistingPos[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rate = fxRates.find((r) => r.quote === currency)?.rate ?? 1;
  const usd = (Number(amount) || 0) / rate;

  const steps = ["Capital", "Risk", "Horizon & objective", "Existing holdings", "Review"];

  async function submit() {
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        capitalAmount: Number(amount),
        capitalCurrency: currency,
        riskScore: risk,
        horizon,
        objective,
        existingPositions: positions
          .filter((p) => p.ticker && Number(p.quantity) > 0 && Number(p.avgPrice) > 0)
          .map((p) => ({
            ticker: p.ticker.trim().toUpperCase(),
            quantity: Number(p.quantity),
            avgPrice: Number(p.avgPrice),
          })),
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? "Could not save");
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  const field =
    "rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]";

  return (
    <div className="mt-6">
      <ol className="mb-5 flex flex-wrap gap-2 text-xs">
        {steps.map((s, i) => (
          <li
            key={s}
            className={cx(
              "rounded-full px-2.5 py-1",
              i === step
                ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
                : i < step
                  ? "text-[var(--color-buy)]"
                  : "text-[var(--color-faint)]",
            )}
          >
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      <div className="card p-5">
        {step === 0 && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold">How much would you like to invest?</h2>
            <div className="flex gap-2">
              <input
                className={cx(field, "w-40 tnum")}
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <select
                className={field}
                value={currency}
                onChange={(e) => setCurrency(e.target.value as Currency)}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-md bg-[var(--color-surface-2)] p-3 text-xs text-[var(--color-muted)]">
              <div>
                Portfolio construction uses USD. Converted amount:{" "}
                <span className="tnum text-[var(--color-fg)]">
                  ${usd.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="mt-1">
                Rate: 1 USD = <span className="tnum">{rate}</span> {currency} · as of{" "}
                {fxRates[0]?.asOf} · {fxRates.find((r) => r.quote === currency)?.source}
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold">What level of risk are you comfortable taking?</h2>
            <p className="rounded-md border border-[var(--color-reduce)]/40 bg-[var(--color-reduce)]/10 px-3 py-2 text-xs text-[var(--color-reduce)]">
              Note the scale direction: <strong>1 = Highest Risk</strong>, <strong>5 = Lowest Risk</strong>.
            </p>
            <div className="space-y-2">
              {RISK_SCORES.map((r) => (
                <button
                  key={r}
                  onClick={() => setRisk(r)}
                  className={cx(
                    "w-full rounded-md border p-3 text-left transition-colors",
                    risk === r
                      ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10"
                      : "border-[var(--color-border)] hover:bg-[var(--color-surface-2)]",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">
                      Risk {r} — {RISK_LABELS[r].title}
                    </span>
                    <span className="text-[11px] text-[var(--color-faint)]">
                      {r === 1 ? "Highest risk" : r === 5 ? "Lowest risk" : ""}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-[var(--color-muted)]">{RISK_LABELS[r].blurb}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h2 className="mb-2 text-sm font-semibold">Investment horizon</h2>
              <div className="flex flex-wrap gap-2">
                {HORIZONS.map((h) => (
                  <button
                    key={h}
                    onClick={() => setHorizon(h)}
                    className={cx(
                      "rounded-md border px-3 py-1.5 text-xs",
                      horizon === h
                        ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                        : "border-[var(--color-border)] text-[var(--color-muted)]",
                    )}
                  >
                    {HORIZON_LABELS[h]}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h2 className="mb-2 text-sm font-semibold">Objective</h2>
              <div className="flex flex-wrap gap-2">
                {OBJECTIVES.map((o) => (
                  <button
                    key={o}
                    onClick={() => setObjective(o)}
                    className={cx(
                      "rounded-md border px-3 py-1.5 text-xs",
                      objective === o
                        ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                        : "border-[var(--color-border)] text-[var(--color-muted)]",
                    )}
                  >
                    {OBJECTIVE_LABELS[o]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold">Existing holdings (optional)</h2>
            <p className="text-xs text-[var(--color-muted)]">
              Recommendations take current exposure into account — e.g. a large existing NVIDIA
              position reduces how much new AI-semiconductor exposure is suggested.
            </p>
            {positions.map((p, i) => (
              <div key={i} className="flex gap-2">
                <input
                  placeholder="Ticker"
                  className={cx(field, "w-24")}
                  value={p.ticker}
                  onChange={(e) => {
                    const n = [...positions];
                    n[i] = { ...p, ticker: e.target.value };
                    setPositions(n);
                  }}
                />
                <input
                  placeholder="Quantity"
                  inputMode="decimal"
                  className={cx(field, "w-28 tnum")}
                  value={p.quantity}
                  onChange={(e) => {
                    const n = [...positions];
                    n[i] = { ...p, quantity: e.target.value };
                    setPositions(n);
                  }}
                />
                <input
                  placeholder="Avg price"
                  inputMode="decimal"
                  className={cx(field, "w-28 tnum")}
                  value={p.avgPrice}
                  onChange={(e) => {
                    const n = [...positions];
                    n[i] = { ...p, avgPrice: e.target.value };
                    setPositions(n);
                  }}
                />
                <button
                  onClick={() => setPositions(positions.filter((_, j) => j !== i))}
                  className="px-2 text-[var(--color-sell)]"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              onClick={() => setPositions([...positions, { ticker: "", quantity: "", avgPrice: "" }])}
              className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-muted)]"
            >
              + Add holding
            </button>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-2 text-sm">
            <h2 className="text-sm font-semibold">Review</h2>
            <Row k="Capital" v={`${amount} ${currency} ≈ $${usd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`} />
            <Row k="Risk" v={`${risk}/5 — ${RISK_LABELS[risk].title}`} />
            <Row k="Horizon" v={HORIZON_LABELS[horizon]} />
            <Row k="Objective" v={OBJECTIVE_LABELS[objective]} />
            <Row k="Existing holdings" v={`${positions.filter((p) => p.ticker).length}`} />
            {error && <p className="text-xs text-[var(--color-sell)]">{error}</p>}
          </div>
        )}

        <div className="mt-6 flex justify-between">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm disabled:opacity-40"
          >
            Back
          </button>
          {step < 4 ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white"
            >
              Next
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={submitting}
              className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {submitting ? "Constructing…" : "Build my strategy"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-[var(--color-border)] py-1.5">
      <span className="text-[var(--color-muted)]">{k}</span>
      <span className="tnum">{v}</span>
    </div>
  );
}

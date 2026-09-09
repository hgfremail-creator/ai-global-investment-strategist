import Link from "next/link";
import { APP } from "@/lib/config";

export const metadata = { title: `Disclaimer & Methodology — ${APP.name}` };

export default function LegalPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 text-sm leading-relaxed text-[var(--color-muted)]">
      <h1 className="text-lg font-semibold text-[var(--color-fg)]">Disclaimer &amp; how this works</h1>

      <h2 className="mt-6 font-semibold text-[var(--color-fg)]">Nature of the service</h2>
      <p className="mt-2">
        {APP.name} is an AI-powered research and portfolio-analysis tool. It is not a broker, not a
        registered investment adviser, and does not provide personalised investment advice within
        the meaning of any securities regulation. All portfolios and trades are simulated (paper
        investing). No real orders are ever placed.
      </p>

      <h2 className="mt-6 font-semibold text-[var(--color-fg)]">Risk</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>Investing involves risk, including the possible loss of the amount invested.</li>
        <li>Past performance and back-tested or simulated results do not guarantee future results.</li>
        <li>Forecasts, scenarios and stress tests are hypothetical and may prove materially wrong.</li>
        <li>
          Recommendations are generated from the information available to the application at the
          time. That information may be incomplete, delayed, or — where marked — simulated.
        </li>
        <li>The application does not guarantee any investment outcome.</li>
      </ul>

      <h2 className="mt-6 font-semibold text-[var(--color-fg)]">Data</h2>
      <p className="mt-2">
        Unless a live market-data provider is configured, prices, fundamentals, macro series and
        news are drawn from a clearly labelled simulated demo dataset and must not be treated as
        real-time market data.
      </p>

      <h2 className="mt-6 font-semibold text-[var(--color-fg)]">Transparency</h2>
      <p className="mt-2">
        Every recommendation shows its supporting evidence and sources, its conviction and
        evidence-quality scores, and the conditions that would invalidate the thesis. Analysis is
        labelled as FACT / DATA / ANALYST INTERPRETATION / AI ASSESSMENT / FORECAST / UNCERTAINTY.
        Where evidence is insufficient the application says so and may recommend no action.
      </p>

      <h2 className="mt-6 font-semibold text-[var(--color-fg)]">Conflicts of interest</h2>
      <p className="mt-2">
        Any known conflicts (application provider, AI vendor, or data vendor relationships) are
        disclosed in the application and next to affected securities.
      </p>

      <h2 className="mt-6 font-semibold text-[var(--color-fg)]">Before commercial use</h2>
      <p className="mt-2">
        This application is architected so that professional regulatory and compliance review can
        be added before any commercial deployment. It has not yet had such review.
      </p>

      <p className="mt-8">
        <Link className="text-[var(--color-accent)]" href="/dashboard">
          ← Back
        </Link>
      </p>
    </div>
  );
}

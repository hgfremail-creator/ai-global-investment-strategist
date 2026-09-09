"use client";

import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Point = { date: string; portfolio: number; benchmark: number; blended: number };

const tip = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  fontSize: 12,
};

export function PerformanceChart({ data, benchmarkLabel, blendedLabel }: { data: Point[]; benchmarkLabel: string; blendedLabel: string }) {
  if (data.length < 2) return <p className="text-xs text-[var(--color-muted)]">Need at least two strategy versions.</p>;
  return (
    <div className="h-56 w-full" role="img" aria-label="Paper portfolio value vs benchmarks, indexed to 100">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="2 4" />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--color-faint)" }} tickFormatter={(d: string) => d.slice(5)} minTickGap={30} />
          <YAxis tick={{ fontSize: 10, fill: "var(--color-faint)" }} width={40} domain={["auto", "auto"]} />
          <Tooltip contentStyle={tip} labelStyle={{ color: "var(--color-muted)" }} />
          <Line type="monotone" dataKey="portfolio" name="Portfolio" stroke="var(--color-accent)" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="benchmark" name={benchmarkLabel} stroke="var(--color-muted)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="blended" name={blendedLabel} stroke="var(--color-gold)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DrawdownChart({ data }: { data: { date: string; portfolio: number }[] }) {
  if (data.length < 2) return null;
  let peak = -Infinity;
  const dd = data.map((d) => {
    peak = Math.max(peak, d.portfolio);
    return { date: d.date, drawdown: Math.round((d.portfolio / peak - 1) * 10000) / 100 };
  });
  return (
    <div className="h-40 w-full" role="img" aria-label="Portfolio drawdown from peak, percent">
      <ResponsiveContainer>
        <AreaChart data={dd} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="dd" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-sell)" stopOpacity={0.05} />
              <stop offset="100%" stopColor="var(--color-sell)" stopOpacity={0.4} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--color-faint)" }} tickFormatter={(d: string) => d.slice(5)} minTickGap={30} />
          <YAxis tick={{ fontSize: 10, fill: "var(--color-faint)" }} width={40} tickFormatter={(v: number) => `${v}%`} />
          <Tooltip contentStyle={tip} formatter={(v: number) => `${v}%`} />
          <Area type="monotone" dataKey="drawdown" stroke="var(--color-sell)" fill="url(#dd)" strokeWidth={1.5} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

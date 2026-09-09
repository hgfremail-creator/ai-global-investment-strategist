"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { SLEEVE_LABELS, SLEEVES, type Sleeve } from "@/lib/enums";

const COLORS: Record<Sleeve, string> = {
  growth: "#4c8dff",
  defensiveEquity: "#22c55e",
  gold: "#d4af37",
  bonds: "#a855f7",
  cash: "#8b98b4",
  diversifiers: "#14b8a6",
};

export function SleeveHistoryChart({
  data,
}: {
  data: { version: number; weekOf: string; sleeves: Record<Sleeve, number> }[];
}) {
  if (data.length < 2) {
    return <p className="text-xs text-[var(--color-muted)]">Need at least two versions to chart history.</p>;
  }
  const rows = data.map((d) => ({
    label: `v${d.version}`,
    ...Object.fromEntries(SLEEVES.map((s) => [s, Math.round((d.sleeves[s] ?? 0) * 1000) / 10])),
  }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <AreaChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} stackOffset="expand">
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--color-faint)" }} />
          <YAxis
            tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
            tick={{ fontSize: 10, fill: "var(--color-faint)" }}
            width={40}
          />
          <Tooltip
            formatter={(v: number, name) => [`${v}%`, SLEEVE_LABELS[name as Sleeve] ?? name]}
            contentStyle={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Legend
            formatter={(name) => SLEEVE_LABELS[name as Sleeve] ?? name}
            wrapperStyle={{ fontSize: 11 }}
          />
          {SLEEVES.map((s) => (
            <Area
              key={s}
              type="monotone"
              dataKey={s}
              stackId="1"
              stroke={COLORS[s]}
              fill={COLORS[s]}
              fillOpacity={0.7}
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

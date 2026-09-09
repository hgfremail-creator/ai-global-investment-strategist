"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function PriceChart({ data }: { data: { date: string; close: number }[] }) {
  if (data.length < 2) return <div className="text-xs text-[var(--color-muted)]">No price history.</div>;
  return (
    <div className="h-48 w-full">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="pc" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "var(--color-faint)" }}
            tickFormatter={(d: string) => d.slice(2, 7)}
            minTickGap={40}
          />
          <YAxis
            domain={["auto", "auto"]}
            tick={{ fontSize: 10, fill: "var(--color-faint)" }}
            width={44}
            tickFormatter={(v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 0 })}
          />
          <Tooltip
            contentStyle={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: "var(--color-muted)" }}
          />
          <Area
            type="monotone"
            dataKey="close"
            stroke="var(--color-accent)"
            fill="url(#pc)"
            strokeWidth={1.5}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

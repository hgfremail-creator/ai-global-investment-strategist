"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

const PALETTE = [
  "#4c8dff", "#22c55e", "#d4af37", "#a855f7", "#f97316",
  "#14b8a6", "#ef4444", "#8b98b4", "#eab308", "#60a5fa", "#34d399",
];

export function Donut({
  data,
  height = 220,
}: {
  data: { name: string; value: number }[];
  height?: number;
}) {
  const filtered = data.filter((d) => d.value > 0.0005);
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={filtered}
            dataKey="value"
            nameKey="name"
            innerRadius="55%"
            outerRadius="85%"
            paddingAngle={1.5}
            stroke="var(--color-surface)"
            isAnimationActive={false}
          >
            {filtered.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(v: number) => `${(v * 100).toFixed(1)}%`}
            contentStyle={{
              background: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LegendList({ data }: { data: { name: string; value: number }[] }) {
  const filtered = data.filter((d) => d.value > 0.0005).sort((a, b) => b.value - a.value);
  return (
    <ul className="space-y-1 text-xs">
      {filtered.map((d, i) => (
        <li key={d.name} className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: PALETTE[i % PALETTE.length] }}
            />
            <span className="text-[var(--color-muted)]">{d.name}</span>
          </span>
          <span className="tnum">{(d.value * 100).toFixed(1)}%</span>
        </li>
      ))}
    </ul>
  );
}

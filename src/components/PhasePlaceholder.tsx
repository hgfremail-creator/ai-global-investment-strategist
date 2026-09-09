import { Card } from "@/components/ui";

export function PhasePlaceholder({
  title,
  phase,
  delivers,
}: {
  title: string;
  phase: number;
  delivers: string[];
}) {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-lg font-semibold">{title}</h1>
      <Card className="mt-4">
        <p className="text-sm text-[var(--color-muted)]">
          This section is delivered in <strong className="text-[var(--color-fg)]">Phase {phase}</strong>{" "}
          of the build. It will provide:
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[var(--color-muted)]">
          {delivers.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function Markdown({ children }: { children: string }) {
  return (
    <div className="gis-md text-sm leading-relaxed text-[var(--color-muted)]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (p) => <h1 className="mb-2 mt-4 text-lg font-semibold text-[var(--color-fg)]" {...p} />,
          h2: (p) => <h2 className="mb-2 mt-5 text-sm font-semibold uppercase tracking-wider text-[var(--color-fg)]" {...p} />,
          h3: (p) => <h3 className="mb-1 mt-3 text-sm font-semibold text-[var(--color-fg)]" {...p} />,
          p: (p) => <p className="my-2" {...p} />,
          ul: (p) => <ul className="my-2 list-disc space-y-1 pl-5" {...p} />,
          ol: (p) => <ol className="my-2 list-decimal space-y-1 pl-5" {...p} />,
          li: (p) => <li {...p} />,
          strong: (p) => <strong className="font-semibold text-[var(--color-fg)]" {...p} />,
          a: (p) => <a className="text-[var(--color-accent)] hover:underline" {...p} />,
          table: (p) => (
            <div className="my-3 overflow-x-auto">
              <table className="w-full border-collapse text-xs" {...p} />
            </div>
          ),
          th: (p) => <th className="border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-left" {...p} />,
          td: (p) => <td className="border border-[var(--color-border)] px-2 py-1 align-top" {...p} />,
          code: (p) => <code className="tnum rounded bg-[var(--color-surface-2)] px-1 py-0.5 text-[0.85em]" {...p} />,
          hr: () => <hr className="my-4 border-[var(--color-border)]" />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

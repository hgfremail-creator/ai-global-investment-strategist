"use client";

import { useRef, useState } from "react";
import { Markdown } from "@/components/Markdown";

type Msg = {
  role: "user" | "assistant";
  text: string;
  citations?: { kind: string; ref: string; detail: string }[];
  usedFallback?: boolean;
};

export function AdvisorChat({ suggestions }: { suggestions: string[] }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  async function send(q: string) {
    if (!q.trim() || busy) return;
    setMessages((m) => [...m, { role: "user", text: q }]);
    setInput("");
    setBusy(true);
    const res = await fetch("/api/advisor", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: q }),
    });
    const data = await res.json().catch(() => ({ answer: "Something went wrong." }));
    setMessages((m) => [
      ...m,
      { role: "assistant", text: data.answer ?? data.error ?? "No answer", citations: data.citations, usedFallback: data.usedFallback },
    ]);
    setBusy(false);
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-sm text-[var(--color-muted)]">Try one of these:</p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-fg)]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
            <div
              className={
                m.role === "user"
                  ? "max-w-[85%] rounded-lg bg-[var(--color-accent)]/15 px-3 py-2 text-sm"
                  : "max-w-full rounded-lg bg-[var(--color-surface-2)] px-3 py-2"
              }
            >
              {m.role === "assistant" ? (
                <>
                  <Markdown>{m.text}</Markdown>
                  {m.citations && m.citations.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5 border-t border-[var(--color-border)] pt-2">
                      {m.citations.map((c, j) => (
                        <span key={j} className="rounded border border-[var(--color-border)] px-1.5 py-0.5 text-[10px] text-[var(--color-faint)]">
                          {c.kind}: {c.ref} · {c.detail}
                        </span>
                      ))}
                    </div>
                  )}
                  {m.usedFallback && (
                    <div className="mt-1 text-[10px] text-[var(--color-faint)]">answered by the deterministic router</div>
                  )}
                </>
              ) : (
                m.text
              )}
            </div>
          </div>
        ))}
        {busy && <div className="text-xs text-[var(--color-muted)]">Thinking…</div>}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="mt-3 flex gap-2 border-t border-[var(--color-border)] pt-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your portfolio…"
          className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          Ask
        </button>
      </form>
    </div>
  );
}

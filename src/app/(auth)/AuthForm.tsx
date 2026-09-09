"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        mode === "register" ? { email, password, name: name || undefined } : { email, password },
      ),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong");
      return;
    }
    const next = params.get("next") || "/dashboard";
    router.replace(next);
    router.refresh();
  }

  async function enterDemo() {
    setLoading(true);
    setError(null);
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 25000);
      const res = await fetch("/api/auth/demo", { method: "POST", signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? `Could not open a session (${res.status})`);
        setLoading(false);
        return;
      }
      window.location.href = "/dashboard";
    } catch (e) {
      setError(
        (e as Error).name === "AbortError"
          ? "The server took too long to respond. Try again."
          : (e as Error).message,
      );
      setLoading(false);
    }
  }

  const field =
    "w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]";

  return (
    <form onSubmit={submit} className="card space-y-3 p-5">
      {mode === "login" && (
        <>
          <button
            type="button"
            onClick={enterDemo}
            disabled={loading}
            className="w-full rounded-md bg-[var(--color-accent)] px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {loading ? "Opening…" : "Enter — no signup"}
          </button>
          <p className="text-center text-[11px] text-[var(--color-faint)]">
            Drops you into a ready-made $100,000 portfolio. Or sign in below.
          </p>
          <div className="my-1 border-t border-[var(--color-border)]" />
        </>
      )}
      {mode === "register" && (
        <div>
          <label className="mb-1 block text-xs text-[var(--color-muted)]">Name (optional)</label>
          <input className={field} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
      )}
      <div>
        <label className="mb-1 block text-xs text-[var(--color-muted)]">Email</label>
        <input
          className={field}
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs text-[var(--color-muted)]">Password</label>
        <input
          className={field}
          type="password"
          required
          minLength={8}
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error && <p className="text-xs text-[var(--color-sell)]">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {loading ? "…" : mode === "register" ? "Create account" : "Sign in"}
      </button>
      <p className="text-center text-xs text-[var(--color-muted)]">
        {mode === "register" ? (
          <>
            Already have an account?{" "}
            <Link className="text-[var(--color-accent)]" href="/login">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New here?{" "}
            <Link className="text-[var(--color-accent)]" href="/register">
              Create an account
            </Link>
          </>
        )}
      </p>
      {mode === "login" && (
        <p className="rounded-md bg-[var(--color-surface-2)] px-3 py-2 text-center text-[11px] text-[var(--color-muted)]">
          Demo account: <span className="tnum">demo@strategist.app</span> / <span className="tnum">demodemo</span>
        </p>
      )}
    </form>
  );
}

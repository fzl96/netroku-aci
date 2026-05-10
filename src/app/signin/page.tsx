"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { INPUT_CLS } from "@/lib/ui-classes";

export default function SignInPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await authClient.signIn.username({ username, password });
    setLoading(false);
    if (error) {
      setError(error.message ?? "Sign in failed");
      return;
    }
    router.push("/");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold text-[var(--text)]">Sign in</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm text-[var(--text)]">
          Username
          <input
            className={INPUT_CLS}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="username"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-[var(--text)]">
          Password
          <input
            type="password"
            className={INPUT_CLS}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </label>
        {error && <p className="text-sm text-[var(--error-text)]">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="text-sm text-[var(--text-subtle)]">
        Need an account?{" "}
        <Link href="/signup" className="underline text-[var(--text)]">
          Sign up
        </Link>
      </p>
    </main>
  );
}

"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LogIn } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/ask";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("Supabase isn't configured in this environment — add the env vars and redeploy.");
      return;
    }

    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);

    if (signInError) {
      setError(
        signInError.message === "Invalid login credentials"
          ? "That email and password don't match — double-check with an admin if you're not sure."
          : signInError.message
      );
      return;
    }

    router.push(next);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-[12.5px] font-medium text-navy/70">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@greaterinside.com"
          className="rounded-2xl border border-navy/12 bg-white px-4 py-3 text-[14px] text-navy outline-none transition-colors focus:border-terracotta/50"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-[12.5px] font-medium text-navy/70">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          className="rounded-2xl border border-navy/12 bg-white px-4 py-3 text-[14px] text-navy outline-none transition-colors focus:border-terracotta/50"
        />
      </div>

      {error && (
        <p className="rounded-2xl border border-terracotta/25 bg-terracotta/10 px-3.5 py-2.5 text-[12.5px] text-terracotta">
          {error}
        </p>
      )}

      <button type="submit" disabled={loading} className="btn-cta mt-1 w-full">
        <LogIn size={16} />
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

"use client";
import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { credentialsSchema, loginFailure } from "../schema";

export function LoginForm() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    const parsed = credentialsSchema.safeParse(Object.fromEntries(data));
    if (!parsed.success) { setMessage("Enter a valid email and a password of at most 128 bytes."); return; }
    setPending(true); setMessage("");
    try {
      const result = await signIn("credentials", { ...parsed.data, redirect: false, callbackUrl: "/dashboard" });
      if (result?.ok && !result.error) { window.location.assign(new URL("/dashboard", window.location.origin).href); return; }
      setMessage(loginFailure);
    } catch { setMessage("Sign-in is unavailable. Please try again."); }
    setPending(false);
  }
  return <form onSubmit={submit} className="mt-6 grid gap-4" aria-busy={pending}>
    <div><label htmlFor="email" className="mb-2 block font-medium">Email</label><Input id="email" name="email" type="email" autoComplete="username" required maxLength={254} aria-describedby="login-help login-result" /></div>
    <div><label htmlFor="password" className="mb-2 block font-medium">Password</label><Input id="password" name="password" type="password" autoComplete="current-password" required maxLength={128} aria-describedby="login-result" /></div>
    <p id="login-help" className="text-sm text-text-secondary">Use your seeded demo account. Ask your local project administrator if you need access.</p>
    <p id="login-result" role="status" className="text-sm text-danger">{message}</p>
    <Button type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</Button>
  </form>;
}

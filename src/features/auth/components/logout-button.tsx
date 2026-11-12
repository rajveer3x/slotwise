"use client";
import { useState } from "react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
export function LogoutButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return <div><Button variant="secondary" disabled={pending} onClick={async () => {
    setPending(true); setError("");
    try { await signOut({ redirect: false }); window.location.assign(new URL("/login", window.location.origin).href); }
    catch { setError("Could not sign out. Please retry."); setPending(false); }
  }}>{pending ? "Signing out…" : "Sign out"}</Button><p role="status" className="text-sm text-danger">{error}</p></div>;
}

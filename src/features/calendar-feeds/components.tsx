"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { calendarSubscriptionAction } from "./actions";
import type { CalendarChange, CalendarFeedCard } from "./schema";

export function CalendarSubscriptionCard({ card }: { card: CalendarFeedCard }) {
  const router = useRouter();
  const heading = useId();
  const urlId = useId();
  const field = useRef<HTMLInputElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const rotateButton = useRef<HTMLButtonElement>(null);
  const revokeButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<"rotate" | "revoke" | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<"rotate" | "revoke" | null>(null);
  const [result, setResult] = useState<{ url: string; version: number } | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  // A refresh after another session's rotation must hide the superseded URL.
  const url = card.active && card.allowed && result?.version === card.version ? result.url : "";

  useEffect(() => {
    if (confirm) {
      confirmButton.current?.focus();
    } else if (returnFocus.current) {
      const button = returnFocus.current === "rotate" ? rotateButton : revokeButton;
      button.current?.focus();
      returnFocus.current = null;
    }
  }, [confirm]);

  function change(operation: CalendarChange["operation"]) {
    setError("");
    setMessage("");
    startTransition(async () => {
      try {
        const response = await calendarSubscriptionAction({
          operation, scope: card.scope, scopeId: card.scopeId, expectedVersion: card.version,
        });
        if (!response.ok) {
          setError(response.message);
          const needsRefresh = response.code !== "VALIDATION_ERROR";
          setStale(needsRefresh);
          if (needsRefresh) setResult(null);
          return;
        }
        setResult(response.url ? { url: response.url, version: response.version } : null);
        setConfirm(null);
        setMessage(response.message);
      } catch {
        setError("Could not confirm the change. Refresh this subscription before trying again.");
        setStale(true);
        setResult(null);
      }
    });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Subscription URL copied.");
    } catch {
      field.current?.focus();
      field.current?.select();
      setMessage("Link selected. Use your device’s copy command.");
    }
  }

  return <section className="schedule-panel" aria-labelledby={heading}>
    <h2 id={heading} className="text-lg">{card.label}</h2>
    <p className="mt-2 text-text-secondary">
      {!card.allowed ? "Scope access ended. You can revoke this link." : card.active ? "Subscription active" : "No active subscription"}
    </p>
    {url && <div className="mt-4 grid gap-2">
      <label htmlFor={urlId} className="font-medium">Private subscription URL</label>
      <Input id={urlId} ref={field} readOnly value={url} spellCheck={false} autoComplete="off" onFocus={event => event.currentTarget.select()} />
      <div><Button variant="secondary" onClick={copy} disabled={pending}>Copy subscription URL</Button></div>
    </div>}
    {card.allowed && card.active && !url && <p className="mt-3 text-text-secondary">Rotate the link if you need a new URL.</p>}
    <div className="mt-4 flex flex-wrap gap-3">
      {stale ? <Button variant="secondary" onClick={() => {
        setStale(false);
        setConfirm(null);
        setError("");
        setResult(null);
        startTransition(() => router.refresh());
      }} disabled={pending}>Refresh subscription</Button> : confirm ? <>
        <p className="w-full">The current URL will stop working. {confirm === "rotate" && "Add the new URL to your calendar app after rotating."}</p>
        <Button ref={confirmButton} onClick={() => change(confirm)} disabled={pending}>
          {pending ? "Saving…" : confirm === "rotate" ? "Confirm rotation" : "Confirm revocation"}
        </Button>
        <Button variant="secondary" onClick={() => {
          returnFocus.current = confirm;
          setConfirm(null);
        }} disabled={pending}>Cancel</Button>
      </> : card.active ? <>
        {card.allowed && <Button ref={rotateButton} variant="secondary" disabled={pending} onClick={() => setConfirm("rotate")}>Rotate link</Button>}
        <Button ref={revokeButton} variant="secondary" className="text-danger" disabled={pending} onClick={() => setConfirm("revoke")}>Revoke link</Button>
      </> : <Button onClick={() => change("create")} disabled={pending}>{pending ? "Creating…" : "Create subscription"}</Button>}
    </div>
    {error && <p className="mt-3 text-danger" role="alert">{error}</p>}
    <div role="status" className="mt-3 text-success">{message}</div>
  </section>;
}

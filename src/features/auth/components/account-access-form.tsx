"use client";
import { useActionState } from "react";
import { updateAccountAccess } from "../actions";
import { Button } from "@/components/ui/button";
export function AccountAccessForm({ userId, active, name }: { userId: string; active: boolean; name: string }) {
  const [state, action, pending] = useActionState(updateAccountAccess, { ok: false, message: "" });
  return <form action={action} className="mt-4" aria-busy={pending}>
    <input type="hidden" name="userId" value={userId} /><input type="hidden" name="expectedActive" value={String(active)} /><input type="hidden" name="active" value={String(!active)} />
    <Button type="submit" variant="secondary" disabled={pending} aria-label={`${active ? "Revoke" : "Activate"} ${name}`}>{pending ? "Saving…" : active ? "Revoke access" : "Activate account"}</Button>
    <p role="status" className={`mt-2 text-sm ${state.ok ? "text-success" : "text-danger"}`}>{state.message}</p>
  </form>;
}

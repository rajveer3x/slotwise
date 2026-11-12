import { requirePageSession } from "@/server/auth/page-session";
import { listAccounts } from "@/server/services/accounts";
import { AccountAccessForm } from "@/features/auth/components/account-access-form";
export default async function AdminPage() {
  const user = await requirePageSession();
  if (user.role !== "ADMIN") return <main id="main-content" tabIndex={-1} className="app-content"><h1 className="text-2xl font-semibold">Access denied</h1><p className="mt-4">Account administration requires an active department administrator.</p></main>;
  const accounts = await listAccounts();
  return <main id="main-content" tabIndex={-1} className="app-content"><h1 className="text-2xl font-semibold">Account access</h1><p className="mt-4 text-text-secondary">Access changes apply on the next protected request. You cannot revoke your own account here.</p>
    <ul className="mt-6 grid gap-4 md:grid-cols-2">{accounts.map(account => <li key={account.id} className="min-w-0 rounded-panel border border-border-subtle p-4"><h2 className="text-lg font-semibold break-words">{account.name}</h2><p className="break-all text-sm text-text-secondary">{account.email}</p><p className="mt-2 text-sm">{account.role} · {account.active ? "Active" : "Revoked"}</p>{account.id === user.id ? <p className="mt-4 text-sm text-text-secondary">Your current account</p> : <AccountAccessForm userId={account.id} active={account.active} name={account.name} />}</li>)}</ul>
  </main>;
}

import type { ReactNode } from "react";
import { Brand } from "./brand";
export function PublicShell({ children }: { children: ReactNode }) {
  return <><header className="border-b border-border-subtle"><div className="mx-auto flex min-h-18 max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 md:px-8"><Brand /><span className="text-xs font-medium text-text-secondary">University scheduling / Local demo</span></div></header>{children}<footer className="mt-auto border-t border-border-subtle bg-surface-subtle"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-2 px-4 py-6 text-xs text-text-secondary md:flex-row md:px-8"><p>SlotWise · Built for a more organized academic week.</p><p>Institution timezone: Asia/Kolkata</p></div></footer></>;
}

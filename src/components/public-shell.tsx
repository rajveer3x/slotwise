import type { ReactNode } from "react";
import { Brand } from "./brand";
export function PublicShell({ children }: { children: ReactNode }) {
  return <div className="public-shell"><header className="public-header"><div className="mx-auto flex min-h-20 max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3 md:px-8"><Brand /><span className="public-campus"><span className="campus-tag">LPU</span>Lovely Professional University</span></div></header>{children}<footer className="public-footer"><div className="mx-auto flex max-w-7xl flex-col justify-between gap-2 px-5 py-6 text-xs text-text-secondary md:flex-row md:px-8"><p>SlotWise · A little structure. A better academic week.</p><p>Academic project · Synthetic demo · Asia/Kolkata</p></div></footer></div>;
}

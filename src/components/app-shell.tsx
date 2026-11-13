"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import { Brand } from "./brand";
import { Button } from "./ui/button";
import { LogoutButton } from "@/features/auth/components/logout-button";

export function AppShell({ name, role, department, children }: { name: string; role: string; department: string; children: ReactNode }) {
  const path = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);
  const menu = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const links = [{ href: "/dashboard", label: "Dashboard" }, { href: "/timetable", label: "Timetable" }, ...(["ADMIN", "COORDINATOR"].includes(role) ? [{ href: "/admin", label: "Master data" }] : []), ...(role === "ADMIN" ? [{ href: "/admin/accounts", label: "Account access" }] : [])];
  const nav = <nav aria-label="Main navigation" className="grid gap-2">{links.map(link => <Link key={link.href} href={link.href} aria-current={path === link.href ? "page" : undefined} className={`rounded-control border-l-2 px-3 py-3 text-sm ${path === link.href ? "border-primary bg-primary-tint font-medium text-info" : "border-transparent hover:bg-surface-hover"}`} onClick={() => dialog.current?.close()}>{link.label}</Link>)}</nav>;
  return <div className="app-shell">
    <aside className="app-sidebar"><Brand /><p className="my-6 text-sm break-words text-text-secondary">{department}<br />{role}</p>{nav}</aside>
    <div className="min-w-0"><header className="app-topbar"><button ref={menu} className="button button-secondary lg:hidden" aria-haspopup="dialog" aria-expanded={open} onClick={() => { dialog.current?.showModal(); setOpen(true); }}>Menu</button><span className="min-w-0 flex-1 truncate text-sm">{name} · {role}</span><LogoutButton /></header>{children}</div>
    <dialog ref={dialog} className="app-drawer" onClose={() => { setOpen(false); menu.current?.focus(); }} onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }} aria-labelledby="menu-title">
      <div className="mb-6 flex items-center justify-between gap-4"><h2 id="menu-title" className="font-semibold">Navigation</h2><Button variant="secondary" onClick={() => dialog.current?.close()}>Close menu</Button></div><p className="mb-6 break-words text-sm">{department} · {role}</p>{nav}
    </dialog>
  </div>;
}

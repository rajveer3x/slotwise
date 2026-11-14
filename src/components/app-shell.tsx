"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";
import { Brand } from "./brand";
import { Button } from "./ui/button";
import { LogoutButton } from "@/features/auth/components/logout-button";
import { ArrowUpRight, BarChart3, CalendarDays, CalendarOff, ChevronRight, GraduationCap, LayoutDashboard, Menu, Settings2, ShieldCheck, Sparkles, Timer, Waypoints } from "lucide-react";

export function AppShell({ name, role, department, children }: { name: string; role: string; department: string; children: ReactNode }) {
  const path = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);
  const menu = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const links = [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }, { href: "/timetable", label: "Timetable", icon: CalendarDays }, ...(["FACULTY", "HOD", "COORDINATOR", "ADMIN"].includes(role) ? [{ href: "/leave", label: "Leave & impact", icon: CalendarOff }] : []), ...(role !== "STUDENT" ? [{ href: "/cover-requests", label: "Cover & exceptions", icon: ShieldCheck }] : []), ...(["ADMIN", "COORDINATOR"].includes(role) ? [{ href: "/resolutions", label: "Resolutions", icon: Waypoints }, { href: "/admin", label: "Master data", icon: Settings2 }] : []), ...(["FACULTY", "HOD", "COORDINATOR"].includes(role) ? [{ href: "/delivery", label: "Class delivery", icon: CalendarDays }] : []), ...(["ADMIN", "COORDINATOR", "HOD"].includes(role) ? [{ href: "/classes-owed", label: "Classes owed", icon: GraduationCap }] : []), ...(role !== "STUDENT" ? [{ href: "/workload", label: "Workload", icon: Timer }] : []), ...(["ADMIN", "COORDINATOR", "HOD"].includes(role) ? [{ href: "/reports", label: "Reports", icon: BarChart3 }] : []), ...(role === "ADMIN" ? [{ href: "/admin/accounts", label: "Account access", icon: ShieldCheck }] : [])];
  const title = links.find(link => path === link.href)?.label ?? "Workspace";
  const roleLabel = role === "HOD" ? "Head of department" : role.charAt(0) + role.slice(1).toLowerCase();
  const nav = <nav aria-label="Main navigation" className="sidebar-nav">{links.map(({ icon: Icon, ...link }) => <Link key={link.href} href={link.href} aria-current={path === link.href ? "page" : undefined} className={`sidebar-link ${path === link.href ? "is-active" : ""}`} onClick={() => dialog.current?.close()}><Icon size={19} strokeWidth={1.7} aria-hidden="true" /><span>{link.label}</span>{path === link.href && <span className="nav-active-dot" aria-hidden="true"><ChevronRight size={13} /></span>}</Link>)}</nav>;
  const campus = <div className="campus-card"><span className="campus-icon"><GraduationCap size={23} aria-hidden="true" /></span><p>Lovely Professional<br /><strong>University</strong></p><span className="campus-tag">LPU</span></div>;
  return <div className="app-shell">
    <aside className="app-sidebar"><Brand />{campus}<p className="nav-section-label">WORKSPACE</p>{nav}<div className="sidebar-bottom"><div className="semester-note"><Sparkles size={20} aria-hidden="true" /><h2>A little more clarity.<br />A better academic week.</h2><p>Your schedule, leave and recovery in one considered space.</p><Link href="/timetable">Open timetable <ArrowUpRight size={16} aria-hidden="true" /></Link></div><p className="sidebar-footnote">SlotWise · Academic workspace</p></div></aside>
    <div className="app-workspace min-w-0"><header className="app-topbar"><button ref={menu} className="button button-secondary lg:hidden" aria-haspopup="dialog" aria-expanded={open} onClick={() => { dialog.current?.showModal(); setOpen(true); }}><Menu size={18} aria-hidden="true" />Menu</button><div className="topbar-breadcrumb"><span>Workspace</span><ChevronRight size={14} aria-hidden="true" /><strong>{title}</strong></div><div className="topbar-account"><span className="user-avatar" aria-hidden="true">{name.split(" ").filter(Boolean).slice(0, 2).map(part => part[0]).join("")}</span><div className="topbar-user"><span>{name}</span><small>{roleLabel} · {department}</small></div></div><LogoutButton /></header>{children}</div>
    <dialog ref={dialog} className="app-drawer" onClose={() => { setOpen(false); menu.current?.focus(); }} onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }} aria-labelledby="menu-title">
      <div className="mb-6 flex items-center justify-between gap-4"><h2 id="menu-title" className="font-semibold">Navigation</h2><Button variant="secondary" onClick={() => dialog.current?.close()}>Close menu</Button></div>{campus}<p className="my-5 break-words text-sm">{department} · {roleLabel}</p>{nav}
    </dialog>
  </div>;
}

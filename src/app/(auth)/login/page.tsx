import { PublicShell } from "@/components/public-shell";
import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/features/auth/components/login-form";
export const metadata: Metadata = { title: "Sign in" };
export default function LoginPage() {
  return <PublicShell><main id="main-content" tabIndex={-1} className="login-layout">
    <aside className="login-story"><span className="eyebrow light">YOUR CAMPUS, CONNECTED</span><h2>A little structure.<br />A lot more<br /><span>possibility.</span></h2><p>One thoughtful space for your timetable, teaching commitments and the changes in between.</p><div className="login-orbits" aria-hidden="true"><span>Plan.</span><span>Adapt.</span><span>Teach.</span></div><p className="login-campus">Lovely Professional University<br /><span>SlotWise academic project</span></p></aside>
    <div className="login-card"><p className="eyebrow mb-3">LET’S GET YOU SETTLED IN</p>
    <h1 className="text-2xl font-semibold md:text-[28px]">Sign in to SlotWise</h1>
    <LoginForm />
    <Link href="/" className="inline-link mt-6 inline-block">Back to SlotWise</Link></div>
  </main></PublicShell>;
}

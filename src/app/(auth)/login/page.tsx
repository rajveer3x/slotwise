import { PublicShell } from "@/components/public-shell";
import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/features/auth/components/login-form";
export const metadata: Metadata = { title: "Sign in" };
export default function LoginPage() {
  return <PublicShell><main id="main-content" tabIndex={-1} className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
    <p className="mb-3 text-sm text-text-secondary">SlotWise · Local demo</p>
    <h1 className="text-2xl font-semibold md:text-[28px]">Sign in to SlotWise</h1>
    <LoginForm />
    <Link href="/" className="inline-link mt-6 self-start">Back to SlotWise</Link>
  </main></PublicShell>;
}

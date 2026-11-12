import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-7xl px-4 py-12 md:px-8">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="mt-4 text-text-secondary">This page isn’t part of the current SlotWise preview.</p>
      <Link href="/" className="inline-link mt-6 inline-block py-2">Return to SlotWise</Link>
    </main>
  );
}

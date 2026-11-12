"use client";
import { Button } from "@/components/ui/button";
export default function RootError({ reset }: { reset: () => void }) {
  return <main id="main-content" tabIndex={-1} className="mx-auto max-w-xl p-6"><h1 className="text-2xl font-semibold">SlotWise is unavailable</h1><p className="my-4">Could not load your account. Check the local database and try again.</p><Button onClick={reset}>Try again</Button></main>;
}

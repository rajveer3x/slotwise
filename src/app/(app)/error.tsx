"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) { return <main id="main-content" tabIndex={-1} className="app-content"><h1 className="text-2xl font-semibold">Workspace unavailable</h1><p className="my-4">Could not load current workspace data. Please try again.</p><Button onClick={reset}>Try again</Button></main>; }

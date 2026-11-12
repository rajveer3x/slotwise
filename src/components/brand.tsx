import { CalendarDays } from "lucide-react";
import Link from "next/link";

export function Brand() {
  return (
    <Link href="/" aria-label="SlotWise home" className="inline-flex min-h-11 items-center gap-2 rounded-control text-lg font-semibold tracking-tight">
      <span className="flex size-8 items-center justify-center rounded-control bg-primary text-on-primary">
        <CalendarDays size={20} aria-hidden="true" />
      </span>
      SlotWise
    </Link>
  );
}

import { Layers2 } from "lucide-react";
import Link from "next/link";

export function Brand() {
  return (
    <Link href="/" aria-label="SlotWise home" className="brand inline-flex min-h-11 items-center gap-3 rounded-control text-xl font-semibold tracking-tight">
      <span className="brand-mark">
        <Layers2 size={23} strokeWidth={2.2} aria-hidden="true" />
      </span>
      SlotWise
    </Link>
  );
}

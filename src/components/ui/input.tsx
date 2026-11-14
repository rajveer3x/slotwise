import type { ComponentPropsWithRef } from "react";

// The caller supplies a visible label and associates help/errors with aria-describedby.
export function Input({ className = "", ...props }: ComponentPropsWithRef<"input">) {
  return <input className={`input ${className}`.trim()} {...props} />;
}

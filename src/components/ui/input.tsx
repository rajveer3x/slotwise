import type { InputHTMLAttributes } from "react";

// The caller supplies a visible label and associates help/errors with aria-describedby.
export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`input ${className}`.trim()} {...props} />;
}

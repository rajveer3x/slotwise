import type { ComponentPropsWithRef } from "react";

type Variant = "primary" | "secondary";

export function buttonClassName(variant: Variant = "primary", className = "") {
  return `button button-${variant} ${className}`.trim();
}

export function Button({ variant = "primary", className, ...props }: ComponentPropsWithRef<"button"> & { variant?: Variant }) {
  return <button type="button" className={buttonClassName(variant, className)} {...props} />;
}

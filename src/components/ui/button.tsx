import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary";

export function buttonClassName(variant: Variant = "primary", className = "") {
  return `button button-${variant} ${className}`.trim();
}

export function Button({ variant = "primary", className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type="button" className={buttonClassName(variant, className)} {...props} />;
}

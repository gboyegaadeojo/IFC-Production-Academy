import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "destructive";

const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-button px-5 text-body font-semibold " +
  "transition-colors duration-[var(--duration-fast)] ease-standard " +
  "disabled:cursor-not-allowed disabled:opacity-60";

const variants: Record<ButtonVariant, string> = {
  // Purple is the single action colour (SPEC §7).
  primary: "bg-accent text-on-accent hover:brightness-110 active:brightness-95",
  secondary: "border border-border bg-surface text-text hover:bg-hover active:bg-card",
  tertiary: "px-2 text-accent-light underline-offset-4 hover:underline",
  destructive: "border border-error text-error hover:bg-hover",
};

export function buttonClasses(variant: ButtonVariant = "primary", className = ""): string {
  return `${base} ${variants[variant]} ${className}`.trim();
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant };

export function Button({ variant = "primary", className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClasses(variant, className)} {...props} />;
}

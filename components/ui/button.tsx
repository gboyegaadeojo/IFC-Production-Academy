import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "destructive";
export type ButtonSize = "md" | "sm";

const base =
  "inline-flex items-center justify-center gap-2 rounded-button font-medium whitespace-nowrap " +
  "transition-surface disabled:cursor-not-allowed disabled:opacity-55 aria-busy:cursor-progress";

const sizes: Record<ButtonSize, string> = {
  md: "min-h-control px-4 text-body",
  sm: "min-h-control px-3 text-small",
};

const variants: Record<ButtonVariant, string> = {
  // Purple is the single action colour (SPEC §7, DESIGN §4.1).
  primary: "bg-accent text-on-accent hover:brightness-110 active:brightness-95",
  secondary: "border border-border-strong text-text hover:bg-hover active:bg-card",
  tertiary: "px-1 text-accent-light underline-offset-4 hover:underline",
  destructive: "border border-error text-error hover:bg-card",
};

export function buttonClasses(
  variant: ButtonVariant = "primary",
  className = "",
  size: ButtonSize = "md",
): string {
  return `${base} ${sizes[size]} ${variants[variant]} ${className}`.trim();
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return <button type={type} className={buttonClasses(variant, className, size)} {...props} />;
}

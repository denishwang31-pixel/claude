import React from "react";
import { cn } from "../../lib/utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center font-medium rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream-600 disabled:opacity-50 disabled:cursor-not-allowed",
        {
          primary: "bg-cream-700 text-white hover:bg-cream-800 active:bg-cream-900",
          secondary: "bg-cream-200 text-cream-800 hover:bg-cream-300 active:bg-cream-400",
          ghost: "bg-transparent text-cream-700 hover:bg-cream-100 active:bg-cream-200",
          danger: "bg-red-500 text-white hover:bg-red-600 active:bg-red-700",
        }[variant],
        {
          sm: "text-xs px-3 py-1.5 gap-1.5",
          md: "text-sm px-4 py-2 gap-2",
          lg: "text-base px-6 py-3 gap-2",
        }[size],
        className
      )}
      {...props}
    />
  );
}

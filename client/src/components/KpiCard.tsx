import React from "react";
import { cn } from "../lib/utils";

interface KpiCardProps {
  title: string;
  value: string;
  subtitle?: string;
  trend?: { value: number; label: string };
  className?: string;
  icon?: React.ReactNode;
}

export function KpiCard({ title, value, subtitle, trend, className, icon }: KpiCardProps) {
  return (
    <div
      className={cn(
        "bg-white rounded-xl p-5 shadow-sm border border-cream-200 flex flex-col gap-2",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-cream-600 font-medium">{title}</span>
        {icon && <span className="text-cream-400">{icon}</span>}
      </div>
      <div className="text-2xl font-bold text-cream-900 font-serif">{value}</div>
      {subtitle && <div className="text-xs text-cream-500">{subtitle}</div>}
      {trend && (
        <div
          className={cn(
            "text-xs font-medium",
            trend.value >= 0 ? "text-red-500" : "text-emerald-600"
          )}
        >
          {trend.value >= 0 ? "▲" : "▼"} {Math.abs(trend.value).toFixed(1)}% {trend.label}
        </div>
      )}
    </div>
  );
}

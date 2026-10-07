import type { LucideIcon } from "lucide-react";
import { cn } from "./cn";

// Pill-style toggle between a few views or filters.
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: React.ReactNode; icon?: LucideIcon }[];
  className?: string;
}) {
  return (
    <div className={cn("inline-flex rounded-lg bg-slate-100 p-0.5 ring-1 ring-inset ring-slate-200", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 h-7 text-sm font-medium transition-colors whitespace-nowrap",
              active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
            )}
          >
            {o.icon && <o.icon size={14} aria-hidden className={active ? "text-brand-600" : undefined} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

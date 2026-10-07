import type { LucideIcon } from "lucide-react";
import {
  Ban,
  Bot,
  ChevronDown,
  ChevronsUp,
  ChevronUp,
  CircleCheck,
  CircleDashed,
  CircleX,
  Minus,
  SkipForward,
} from "lucide-react";
import { cn } from "./cn";

type Tone = "neutral" | "brand" | "success" | "danger" | "warning" | "info" | "purple";

const TONES: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-600 ring-slate-500/10",
  brand: "bg-brand-50 text-brand-700 ring-brand-600/15",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-600/15",
  danger: "bg-red-50 text-red-700 ring-red-600/15",
  warning: "bg-amber-50 text-amber-700 ring-amber-600/20",
  info: "bg-cyan-50 text-cyan-700 ring-cyan-600/15",
  purple: "bg-purple-50 text-purple-700 ring-purple-600/15",
};

export function Badge({
  tone = "neutral",
  icon: Icon,
  className,
  children,
  ...rest
}: {
  tone?: Tone;
  icon?: LucideIcon;
} & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap",
        TONES[tone],
        className
      )}
      {...rest}
    >
      {Icon && <Icon size={12} aria-hidden className="shrink-0" />}
      {children}
    </span>
  );
}

export type RunStatus = "untested" | "passed" | "failed" | "blocked" | "skipped";

// One place for how each execution status looks. Tones follow the dashboard
// chart colors (dashboard-colors.ts): skipped is cyan, blocked amber.
export const STATUS_META: Record<RunStatus, { label: string; icon: LucideIcon; tone: Tone }> = {
  untested: { label: "Sin probar", icon: CircleDashed, tone: "neutral" },
  passed: { label: "Passed", icon: CircleCheck, tone: "success" },
  failed: { label: "Failed", icon: CircleX, tone: "danger" },
  blocked: { label: "Blocked", icon: Ban, tone: "warning" },
  skipped: { label: "Skipped", icon: SkipForward, tone: "info" },
};

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: RunStatus;
  label?: React.ReactNode;
  className?: string;
}) {
  const meta = STATUS_META[status];
  return (
    <Badge tone={meta.tone} icon={meta.icon} className={className}>
      {label ?? meta.label}
    </Badge>
  );
}

export const PRIORITY_META: Record<string, { label: string; icon: LucideIcon; tone: Tone }> = {
  low: { label: "Baja", icon: ChevronDown, tone: "neutral" },
  medium: { label: "Media", icon: Minus, tone: "info" },
  high: { label: "Alta", icon: ChevronUp, tone: "warning" },
  critical: { label: "Crítica", icon: ChevronsUp, tone: "danger" },
};

export function PriorityBadge({ priority, className }: { priority: string; className?: string }) {
  const meta = PRIORITY_META[priority];
  if (!meta) return <Badge className={className}>{priority}</Badge>;
  return (
    <Badge tone={meta.tone} icon={meta.icon} className={className}>
      {meta.label}
    </Badge>
  );
}

export function AutomatedBadge({ label = "Automatizado", className }: { label?: string; className?: string }) {
  return (
    <Badge tone="purple" icon={Bot} className={className}>
      {label}
    </Badge>
  );
}

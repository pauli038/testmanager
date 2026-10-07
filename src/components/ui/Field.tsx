import { cn } from "./cn";

const CONTROL =
  "w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm " +
  "placeholder:text-slate-400 transition-colors " +
  "focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 " +
  "disabled:bg-slate-50 disabled:text-slate-500";

export function Input({ className, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL, "h-9", className)} {...rest} />;
}

export function Select({ className, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(CONTROL, "h-9 pr-8", className)} {...rest} />;
}

export function Textarea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(CONTROL, "py-2", className)} {...rest} />;
}

export function Label({ className, ...rest }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("block text-sm font-medium text-slate-700 mb-1", className)} {...rest} />;
}

// Label + control + optional hint/error, stacked.
export function Field({
  label,
  hint,
  error,
  htmlFor,
  className,
  children,
}: {
  label?: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      {label && <Label htmlFor={htmlFor}>{label}</Label>}
      {children}
      {error ? (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      ) : (
        hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>
      )}
    </div>
  );
}

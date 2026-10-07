import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Loader2 } from "lucide-react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "soft" | "link";
type Size = "xs" | "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-sm",
  secondary: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 shadow-sm",
  ghost: "text-slate-600 hover:text-slate-900 hover:bg-slate-100",
  danger: "bg-red-600 text-white hover:bg-red-700 shadow-sm",
  soft: "bg-brand-50 text-brand-700 hover:bg-brand-100",
  link: "text-brand-600 hover:text-brand-700 hover:underline !p-0 !h-auto",
};

const SIZES: Record<Size, string> = {
  xs: "h-7 px-2.5 text-xs gap-1",
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-9 px-4 text-sm gap-2",
};

type CommonProps = {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  loading?: boolean;
  fullWidth?: boolean;
  className?: string;
  children?: React.ReactNode;
};

export function buttonClasses({
  variant = "primary",
  size = "md",
  fullWidth,
  className,
}: Pick<CommonProps, "variant" | "size" | "fullWidth" | "className">) {
  return cn(
    "inline-flex items-center justify-center rounded-lg font-medium whitespace-nowrap transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1",
    "disabled:opacity-50 disabled:pointer-events-none",
    SIZES[size],
    VARIANTS[variant],
    fullWidth && "w-full",
    className
  );
}

function Content({ icon: Icon, loading, size, children }: CommonProps) {
  const iconSize = size === "md" ? 16 : 14;
  return (
    <>
      {loading ? (
        <Loader2 size={iconSize} className="animate-spin" aria-hidden />
      ) : (
        Icon && <Icon size={iconSize} aria-hidden />
      )}
      {children}
    </>
  );
}

export function Button({
  variant,
  size = "md",
  icon,
  loading,
  fullWidth,
  className,
  children,
  type = "button",
  disabled,
  ...rest
}: CommonProps & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={buttonClasses({ variant, size, fullWidth, className })}
      {...rest}
    >
      <Content icon={icon} loading={loading} size={size}>
        {children}
      </Content>
    </button>
  );
}

export function ButtonLink({
  href,
  variant,
  size = "md",
  icon,
  fullWidth,
  className,
  children,
  ...rest
}: CommonProps & { href: string } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  return (
    <Link href={href} className={buttonClasses({ variant, size, fullWidth, className })} {...rest}>
      <Content icon={icon} size={size}>
        {children}
      </Content>
    </Link>
  );
}

// Square icon-only button (close ✕, delete, move up/down…). `label` is
// required so screen readers and the hover tooltip say what it does.
export function IconButton({
  icon: Icon,
  label,
  size = "md",
  tone = "default",
  className,
  type = "button",
  ...rest
}: {
  icon: LucideIcon;
  label: string;
  size?: "sm" | "md";
  tone?: "default" | "danger";
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex items-center justify-center rounded-md transition-colors shrink-0",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
        "disabled:opacity-40 disabled:pointer-events-none",
        size === "sm" ? "h-6 w-6" : "h-8 w-8",
        tone === "danger"
          ? "text-slate-400 hover:text-red-600 hover:bg-red-50"
          : "text-slate-400 hover:text-slate-700 hover:bg-slate-100",
        className
      )}
      {...rest}
    >
      <Icon size={size === "sm" ? 14 : 16} aria-hidden />
    </button>
  );
}

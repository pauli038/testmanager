"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { IconButton } from "./Button";
import { cn } from "./cn";

const WIDTHS = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
} as const;

// Dialog over a dimmed backdrop. Closes with Escape or the ✕ button; clicking
// the backdrop does nothing on purpose so a half-filled form isn't lost.
export function Modal({
  open = true,
  onClose,
  title,
  description,
  size = "md",
  footer,
  className,
  zIndex = "z-50",
  children,
}: {
  open?: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  size?: keyof typeof WIDTHS;
  footer?: React.ReactNode;
  className?: string;
  zIndex?: string;
  children?: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] flex items-center justify-center p-4",
        zIndex
      )}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "bg-white rounded-2xl shadow-xl ring-1 ring-slate-900/5 w-full max-h-[90vh] flex flex-col",
          WIDTHS[size],
          className
        )}
      >
        {title && (
          <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-900">{title}</h2>
              {description && <p className="text-sm text-slate-500 mt-0.5">{description}</p>}
            </div>
            <IconButton icon={X} label="Cerrar" onClick={onClose} className="-mr-2 -mt-1" />
          </div>
        )}
        <div className={cn("px-6 overflow-y-auto", title ? "pb-5" : "py-5")}>{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50/60 rounded-b-2xl">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

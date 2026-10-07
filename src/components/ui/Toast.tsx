"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { cn } from "./cn";

type Tone = "success" | "error" | "info";
type ToastItem = { id: number; tone: Tone; message: string; description?: string };

type ToastApi = {
  success: (message: string, description?: string) => void;
  error: (message: string, description?: string) => void;
  info: (message: string, description?: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const TONE_META: Record<Tone, { icon: typeof Info; iconClass: string }> = {
  success: { icon: CircleCheck, iconClass: "text-emerald-600" },
  error: { icon: CircleAlert, iconClass: "text-red-600" },
  info: { icon: Info, iconClass: "text-brand-600" },
};

// Errors stay a bit longer: they usually need reading.
const DURATION_MS: Record<Tone, number> = { success: 3500, info: 4000, error: 6000 };

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (tone: Tone, message: string, description?: string) => {
      const id = nextId.current++;
      // Keep at most 4 on screen; the oldest goes first.
      setToasts((t) => [...t.slice(-3), { id, tone, message, description }]);
      setTimeout(() => dismiss(id), DURATION_MS[tone]);
    },
    [dismiss]
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (m, d) => push("success", m, d),
      error: (m, d) => push("error", m, d),
      info: (m, d) => push("info", m, d),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 left-4 sm:left-auto z-[70] flex flex-col items-end gap-2 pointer-events-none"
      >
        {toasts.map((t) => {
          const { icon: Icon, iconClass } = TONE_META[t.tone];
          return (
            <div
              key={t.id}
              role={t.tone === "error" ? "alert" : "status"}
              className="pointer-events-auto w-full sm:w-80 flex items-start gap-3 rounded-xl bg-white px-4 py-3 shadow-lg ring-1 ring-slate-900/10 animate-[toast-in_160ms_ease-out]"
            >
              <Icon size={18} className={cn("shrink-0 mt-px", iconClass)} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-900">{t.message}</p>
                {t.description && <p className="text-xs text-slate-500 mt-0.5">{t.description}</p>}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Cerrar aviso"
                className="shrink-0 rounded text-slate-400 hover:text-slate-700"
              >
                <X size={14} aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de <ToastProvider>");
  return ctx;
}

// Reads `{ error }` from a failed API response, falling back to `fallback`.
export async function errorMessage(res: Response, fallback: string): Promise<string> {
  if (res.status === 401) return "Tu sesión expiró. Vuelve a iniciar sesión.";
  const data = await res.json().catch(() => null);
  return (data && typeof data.error === "string" && data.error) || fallback;
}

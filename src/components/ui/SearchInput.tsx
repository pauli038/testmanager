"use client";

import { Search, X } from "lucide-react";
import { cn } from "./cn";

// Lowercase without accents, so "sabado" finds "Sábado" and "tc-rf020" finds "TC-RF020".
export function normalizeSearch(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

// True when every word of the query appears in some of the texts.
export function matchesSearch(query: string, ...texts: (string | null | undefined)[]) {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalizeSearch(texts.filter(Boolean).join(" "));
  return words.every((w) => haystack.includes(w));
}

// Text box with a magnifier and a button to clear it.
export function SearchInput({
  value,
  onChange,
  placeholder = "Buscar…",
  className,
  autoFocus,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  "aria-label"?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search
        size={15}
        aria-hidden
        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        // Escape clears the text instead of closing the dialog around it.
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
            onChange("");
          }
        }}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-label={ariaLabel ?? placeholder}
        className="h-9 w-full rounded-lg border border-slate-300 bg-white pl-8 pr-8 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Borrar búsqueda"
          title="Borrar búsqueda"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700"
        >
          <X size={14} aria-hidden />
        </button>
      )}
    </div>
  );
}

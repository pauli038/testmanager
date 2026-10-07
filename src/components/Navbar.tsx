"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { ChevronDown, FlaskConical, FolderKanban, LogOut, Users } from "lucide-react";
import { cn } from "@/components/ui";

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  lead: "Lead",
  tester: "Tester",
};

function initials(name?: string | null, email?: string | null) {
  const source = (name || email || "?").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export default function Navbar({
  user,
}: {
  user: { name?: string | null; email?: string | null; role?: string };
}) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const links = [
    { href: "/", label: "Proyectos", icon: FolderKanban, active: pathname === "/" || pathname.startsWith("/projects") },
    { href: "/users", label: "Usuarios", icon: Users, active: pathname.startsWith("/users") },
  ];

  return (
    <header className="sticky top-0 z-40 bg-brand-700 shadow-sm">
      <div className="w-full px-4 sm:px-8 h-14 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6 min-w-0">
          <Link href="/" className="flex items-center gap-2 font-semibold text-white shrink-0">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/20">
              <FlaskConical size={16} aria-hidden />
            </span>
            <span className="hidden sm:inline tracking-tight">Test Manager</span>
          </Link>
          <nav className="flex items-center gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                  l.active
                    ? "bg-white/15 text-white font-medium"
                    : "text-brand-100 hover:text-white hover:bg-white/10"
                )}
              >
                <l.icon size={15} aria-hidden />
                {l.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            className="flex items-center gap-2 rounded-full pl-1 pr-2 py-1 text-white hover:bg-white/10 transition-colors"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-brand-700 text-xs font-semibold">
              {initials(user.name, user.email)}
            </span>
            <span className="hidden md:block text-sm max-w-40 truncate">{user.name}</span>
            <ChevronDown size={14} className="text-brand-100" aria-hidden />
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 mt-2 w-60 rounded-xl bg-white shadow-lg ring-1 ring-slate-900/10 py-1 text-sm"
            >
              <div className="px-4 py-3 border-b border-slate-100">
                <p className="font-medium text-slate-900 truncate">{user.name}</p>
                {user.email && <p className="text-xs text-slate-500 truncate">{user.email}</p>}
                {user.role && (
                  <span className="mt-2 inline-block rounded-md bg-brand-50 px-1.5 py-0.5 text-xs font-medium text-brand-700">
                    {ROLE_LABEL[user.role] ?? user.role}
                  </span>
                )}
              </div>
              <button
                role="menuitem"
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="w-full flex items-center gap-2 px-4 py-2 text-slate-700 hover:bg-slate-50"
              >
                <LogOut size={15} className="text-slate-400" aria-hidden />
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

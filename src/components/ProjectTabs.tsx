"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bug,
  ClipboardList,
  FileText,
  FlaskConical,
  LayoutDashboard,
  PlayCircle,
  Settings,
} from "lucide-react";
import { cn } from "@/components/ui";

export default function ProjectTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;
  const tabs = [
    { href: base, label: "Dashboard", icon: LayoutDashboard, exact: true },
    { href: `${base}/suites`, label: "Casos de prueba", icon: FlaskConical },
    { href: `${base}/plans`, label: "Planes", icon: ClipboardList },
    { href: `${base}/runs`, label: "Runs", icon: PlayCircle },
    { href: `${base}/defects`, label: "Defectos", icon: Bug },
    { href: `${base}/reports`, label: "Reportes", icon: FileText },
    { href: `${base}/settings`, label: "Ajustes", icon: Settings },
  ];

  return (
    <div className="border-b border-slate-200 bg-white">
      <div className="w-full px-4 sm:px-8">
        <nav className="flex gap-1 overflow-x-auto -mb-px">
          {tabs.map((t) => {
            const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-3 text-sm whitespace-nowrap border-b-2 transition-colors",
                  active
                    ? "border-brand-600 text-brand-700 font-medium"
                    : "border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300"
                )}
              >
                <t.icon size={15} aria-hidden className={active ? "text-brand-600" : "text-slate-400"} />
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function ProjectTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;
  const tabs = [
    { href: base, label: "📊 Dashboard", exact: true },
    { href: `${base}/suites`, label: "🧪 Casos de prueba" },
    { href: `${base}/plans`, label: "📝 Planes" },
    { href: `${base}/runs`, label: "▶️ Runs" },
    { href: `${base}/defects`, label: "🐞 Defectos" },
    { href: `${base}/settings`, label: "⚙️ Ajustes" },
  ];

  return (
    <div className="border-b border-slate-200 bg-white">
      <div className="w-full px-4 sm:px-8">
        <nav className="flex gap-1 overflow-x-auto">
          {tabs.map((t) => {
            const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`px-3 py-3 text-sm whitespace-nowrap border-b-2 ${
                  active
                    ? "border-indigo-600 text-indigo-600 font-medium"
                    : "border-transparent text-slate-600 hover:text-slate-900"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

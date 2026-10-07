import { FlaskConical } from "lucide-react";

// Centered card used by the sign-in, sign-up and password recovery pages.
export default function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 bg-gradient-to-br from-brand-50 via-slate-50 to-slate-100">
      <div className="flex items-center gap-2 mb-6 text-brand-700">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
          <FlaskConical size={18} aria-hidden />
        </span>
        <span className="text-lg font-semibold tracking-tight">Test Manager</span>
      </div>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl shadow-slate-900/5 ring-1 ring-slate-900/5 p-8">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

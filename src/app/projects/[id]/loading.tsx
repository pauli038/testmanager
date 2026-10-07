// Skeleton shown while a project tab loads its data on the server.
export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Cargando">
      <div className="h-8 w-48 rounded-lg bg-slate-200" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 rounded-xl bg-white border border-slate-200" />
        ))}
      </div>
      <div className="h-64 rounded-xl bg-white border border-slate-200" />
    </div>
  );
}

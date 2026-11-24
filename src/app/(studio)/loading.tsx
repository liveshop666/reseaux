/** Affiché tout de suite au clic, pendant que la page se charge (navigation fluide). */
export default function Loading() {
  return (
    <div className="mx-auto max-w-4xl animate-pulse" aria-busy="true" aria-label="Chargement">
      <div className="mb-6 h-10 w-56 rounded-lg bg-soft-2" />
      <div className="card divide-y divide-border">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-4">
            <div className="h-3 w-1/3 rounded bg-soft-2" />
            <div className="h-3 flex-1 rounded bg-soft" />
          </div>
        ))}
      </div>
    </div>
  );
}

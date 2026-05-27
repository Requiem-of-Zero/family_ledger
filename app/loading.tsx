// App Router fallback shown when a route segment is waiting on server data.
// The animated logo lives in NavigationProgress, so this file only creates the
// dimmed skeleton background to avoid double loading indicators.
export default function Loading() {
  return (
    <main className="relative mx-auto min-h-[calc(100vh-4rem)] w-full max-w-3xl overflow-hidden px-4 py-8">
      <div className="grid gap-5 opacity-60">
        <div className="rounded-card border border-border bg-surface-bg p-5">
          <div className="flex items-center gap-3">
            <div className="h-7 w-7 animate-pulse rounded-md bg-raised-bg" />
            <div className="h-3 w-48 animate-pulse rounded-full bg-raised-bg" />
          </div>
          <div className="mt-8 grid gap-5">
            <div className="h-3 w-20 animate-pulse rounded-full bg-raised-bg" />
            <div className="h-3 w-28 animate-pulse rounded-full bg-raised-bg" />
            <div className="h-3 w-24 animate-pulse rounded-full bg-raised-bg" />
            <div className="h-3 w-36 animate-pulse rounded-full bg-raised-bg" />
          </div>
        </div>
        <div className="rounded-card border border-border bg-surface-bg p-5">
          <div className="grid gap-3">
            {/* Vary row widths slightly so the placeholder reads like content. */}
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3">
                <div className="h-5 w-5 animate-pulse rounded-md bg-raised-bg" />
                <div
                  className="h-3 animate-pulse rounded-full bg-raised-bg"
                  style={{ width: `${80 + (index % 4) * 28}px` }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="absolute inset-0 bg-black/25 backdrop-blur-[1px]" />
    </main>
  );
}

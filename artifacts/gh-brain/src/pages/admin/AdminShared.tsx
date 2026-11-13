import { Button } from "@/components/ui/button";

export function formatDate(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
}

export function formatDateTime(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function StatCard({
  label, value, icon: Icon, sub,
}: { label: string; value: string | number; icon: React.ElementType; sub?: string }) {
  return (
    <div className="lgt-card lgt-card--compact space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-xs font-mono text-muted-foreground uppercase tracking-wider">{label}</p>
        <Icon className="w-4 h-4 shrink-0 text-muted-foreground" />
      </div>
      <p className="text-2xl font-bold font-mono">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function LoadError({ onRetry }: { onRetry: () => unknown }) {
  return <div role="alert" className="lgt-card lgt-card--compact space-y-3">
    <p>Could not load these records.</p>
    <Button variant="outline" onClick={() => onRetry()}>Retry</Button>
  </div>;
}

export function TabSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-12 rounded-lg bg-secondary/30 animate-pulse" />
      ))}
    </div>
  );
}

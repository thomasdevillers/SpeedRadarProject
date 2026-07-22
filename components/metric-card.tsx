import type { LucideIcon } from "lucide-react";

export function MetricCard({ label, value, detail, icon: Icon, tone = "neutral" }: { label: string; value: string; detail: string; icon: LucideIcon; tone?: "neutral" | "orange" | "teal" }) {
  return (
    <article className={`metric-card tone-${tone} reveal`}>
      <div className="metric-label"><span>{label}</span><Icon size={19} aria-hidden="true" /></div>
      <strong className="metric-value">{value}</strong>
      <span className="metric-detail">{detail}</span>
    </article>
  );
}


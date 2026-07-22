import type { HourlyTrafficPoint } from "@/lib/types";

export function TrafficChart({ data }: { data: HourlyTrafficPoint[] }) {
  const maximum = Math.max(...data.map((point) => point.vehicles), 1);
  return (
    <div className="traffic-chart" role="img" aria-label="Hourly traffic and overspeed vehicles">
      {data.map((point) => (
        <div className="bar-column" key={point.hour}>
          <div className="bar-track">
            <span className="bar-total" style={{ height: `${Math.max(4, (point.vehicles / maximum) * 100)}%` }} />
            <span className="bar-over" style={{ height: `${Math.max(2, (point.overspeed / maximum) * 100)}%` }} />
          </div>
          <span>{point.hour}:00</span>
        </div>
      ))}
    </div>
  );
}


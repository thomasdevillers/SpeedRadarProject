import Link from "next/link";
import { Camera, CircleDashed } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import type { RadarEvent } from "@/lib/types";

export function EventTable({ events, compact = false }: { events: RadarEvent[]; compact?: boolean }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead><tr><th>Captured</th><th>Radar / site</th><th>Speed</th><th>Plate</th><th>Evidence</th><th><span className="sr-only">Open</span></th></tr></thead>
        <tbody>
          {events.slice(0, compact ? 6 : undefined).map((event) => (
            <tr key={event.id}>
              <td><span className="table-primary">{formatDateTime(event.capturedAt)}</span><small>{event.deviceEventId.slice(0, 8)}</small></td>
              <td><span className="table-primary">{event.deviceName}</span><small>{event.siteName}</small></td>
              <td><span className={`speed-chip ${event.overspeedKph > 0 ? "over" : "within"}`}>{event.speedKph}</span><small>{event.overspeedKph > 0 ? `+${event.overspeedKph} km/h` : "within limit"}</small></td>
              <td><span className="plate-chip">{event.plate ?? (event.processingStatus === "pending" ? "PROCESSING" : "—")}</span><small>{event.plateScore ? `${Math.round(event.plateScore * 100)}% confidence` : ""}</small></td>
              <td>{event.photoStatus === "uploaded" ? <span className="evidence"><Camera size={15} /> Photo</span> : <span className="evidence muted"><CircleDashed size={15} /> None</span>}</td>
              <td><Link className="row-link" href={`/events/${event.id}`} aria-label={`Open event ${event.deviceEventId}`}>→</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


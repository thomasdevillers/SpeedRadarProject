import type { RadarEvent } from "@/lib/types";

export function EventPhoto({ event }: { event: RadarEvent }) {
  if (!event.photoUrl) return <div className="photo-empty">No photograph was required for this event.</div>;
  return (
    <figure className="event-photo">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={event.photoUrl} alt={`Vehicle captured by ${event.deviceName} at ${event.speedKph} kilometres per hour`} />
      <figcaption className="photo-overlay">
        <div><span>SPEED</span><strong>{event.speedKph}</strong><small>km/h</small></div>
        <div><span>LIMIT</span><strong>{event.speedLimitKph}</strong><small>km/h</small></div>
        <div className="overlay-plate"><span>PLATE</span><strong>{event.plate ?? "PROCESSING"}</strong></div>
      </figcaption>
    </figure>
  );
}


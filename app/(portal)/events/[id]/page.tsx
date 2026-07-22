import { notFound } from "next/navigation";
import { CheckCircle2, Clock3, Mail, ScanLine } from "lucide-react";
import { EventPhoto } from "@/components/event-photo";
import { PageHeader } from "@/components/page-header";
import { formatDateTime } from "@/lib/format";
import { getEventById } from "@/lib/portal-data";

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await getEventById(id);
  if (!event) notFound();
  return (
    <>
      <PageHeader kicker={`Event ${event.deviceEventId.slice(0, 8).toUpperCase()}`} title={`${event.speedKph} km/h detected`} description={`${formatDateTime(event.capturedAt)} · ${event.deviceName} · ${event.siteName}`} actions={event.photoUrl ? <a className="button secondary" href={event.photoUrl} download={`roadsafe-${event.deviceEventId}.jpg`}>Download evidence</a> : undefined} />
      <section className="event-detail-grid">
        <EventPhoto event={event} />
        <aside className="panel event-facts reveal"><div className="panel-head"><div><span className="eyebrow">Verified record</span><h2>Event details</h2></div></div><dl>
          <div><dt>Detected speed</dt><dd>{event.speedKph} km/h</dd></div><div><dt>Active limit</dt><dd>{event.speedLimitKph} km/h</dd></div><div><dt>Over limit</dt><dd className="orange">+{event.overspeedKph} km/h</dd></div><div><dt>Number plate</dt><dd className="plate-chip">{event.plate ?? "Pending"}</dd></div><div><dt>OCR confidence</dt><dd>{event.plateScore ? `${Math.round(event.plateScore * 100)}%` : "—"}</dd></div><div><dt>Organisation</dt><dd>{event.organizationName ?? "RoadSafe internal"}</dd></div>
        </dl><div className="process-timeline"><span className="done"><CheckCircle2 /> Captured</span><span className={event.processingStatus === "complete" ? "done" : "active"}><ScanLine /> OCR {event.processingStatus}</span><span className={event.emailStatus === "delivered" ? "done" : "active"}><Mail /> Email {event.emailStatus}</span><span><Clock3 /> Retained 90 days</span></div></aside>
      </section>
    </>
  );
}

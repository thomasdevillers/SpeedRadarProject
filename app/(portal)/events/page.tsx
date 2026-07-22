import { Download } from "lucide-react";
import Link from "next/link";
import { EventExplorer } from "@/components/event-explorer";
import { PageHeader } from "@/components/page-header";
import { getEvents } from "@/lib/portal-data";

export const metadata = { title: "Events" };

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const requestedPage = Number((await searchParams).page ?? "1");
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const pageSize = 100;
  const events = await getEvents(pageSize, (page - 1) * pageSize);
  return (
    <>
      <PageHeader kicker="90-day evidence register" title="Vehicle events" description="Search every counted vehicle and review photographs for traffic detected above the active site limit." actions={<Link className="button primary" href="/api/reports/events.csv"><Download size={16} /> Export CSV</Link>} />
      <section className="panel reveal"><div className="panel-head"><div><span className="eyebrow">Page {page}</span><h2>{events.length} vehicle events</h2></div><div className="page-actions">{page > 1 && <Link className="button secondary small" href={`/events?page=${page - 1}`}>Previous</Link>}{events.length === pageSize && <Link className="button secondary small" href={`/events?page=${page + 1}`}>Next</Link>}</div></div><EventExplorer events={events} /></section>
    </>
  );
}

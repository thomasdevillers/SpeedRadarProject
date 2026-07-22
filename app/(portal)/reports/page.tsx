import { Download, FileSpreadsheet, Gauge, TrendingUp } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { TrafficChart } from "@/components/traffic-chart";
import { getDashboardData, getEvents } from "@/lib/portal-data";

export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  const [data, events] = await Promise.all([getDashboardData(), getEvents(1000)]);
  const bands = [{ label: "0–40", count: events.filter((event) => event.speedKph <= 40).length }, { label: "41–60", count: events.filter((event) => event.speedKph >= 41 && event.speedKph <= 60).length }, { label: "61–80", count: events.filter((event) => event.speedKph >= 61 && event.speedKph <= 80).length }, { label: "81–100", count: events.filter((event) => event.speedKph >= 81 && event.speedKph <= 100).length }, { label: "100+", count: events.filter((event) => event.speedKph > 100).length }];
  const distribution = bands.map((band) => ({ label: band.label, value: events.length ? Math.round(band.count * 100 / events.length) : 0 }));
  return (
    <>
      <PageHeader kicker="Traffic intelligence" title="Reports" description="Generate auditable traffic summaries from your retained radar events." actions={<Link className="button primary" href="/api/reports/events.csv"><Download size={16} /> Export CSV</Link>} />
      <div className="filter-bar report-filter"><div><span className="eyebrow">Current view</span><strong>Today&apos;s traffic with a latest-{events.length} event speed sample</strong></div><div><span className="eyebrow">Assigned fleet</span><strong>{data.devices.map((device) => device.name).join(", ") || "No radars"}</strong></div></div>
      <section className="report-grid">
        <article className="panel reveal"><div className="panel-head"><div><span className="eyebrow">Hourly volume</span><h2>Traffic profile</h2></div><TrendingUp /></div><TrafficChart data={data.hourlyTraffic} /></article>
        <article className="panel reveal"><div className="panel-head"><div><span className="eyebrow">Speed bands</span><h2>Distribution</h2></div><Gauge /></div><div className="distribution-chart">{distribution.map((item) => <div key={item.label}><span>{item.label} km/h</span><i><b style={{ width: `${item.value}%` }} /></i><strong>{item.value}%</strong></div>)}</div></article>
      </section>
      <section className="panel reveal section-block"><div className="panel-head"><div><span className="eyebrow">Available export</span><h2>Event register</h2></div><FileSpreadsheet /></div><div className="export-row"><div><strong>Vehicle events CSV</strong><span>Timestamp, radar, site, speed, limit, plate, confidence and evidence state.</span></div><Link className="button secondary" href="/api/reports/events.csv"><Download size={16} /> Download</Link></div></section>
    </>
  );
}

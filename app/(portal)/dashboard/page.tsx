import Link from "next/link";
import { Activity, ArrowUpRight, CarFront, Gauge, RadioTower, Siren } from "lucide-react";
import { DeviceCard } from "@/components/device-card";
import { EventTable } from "@/components/event-table";
import { MetricCard } from "@/components/metric-card";
import { PageHeader } from "@/components/page-header";
import { TrafficChart } from "@/components/traffic-chart";
import { formatNumber } from "@/lib/format";
import { getDashboardData } from "@/lib/portal-data";

export const metadata = { title: "Overview" };

export default async function DashboardPage() {
  const data = await getDashboardData();
  const m = data.metrics;
  return (
    <>
      <PageHeader kicker="Fleet overview · Today" title="One view. Every vehicle." description="Live radar health, traffic volume and evidence across your assigned RoadSafe sites." actions={<Link className="button primary" href="/events">Review events <ArrowUpRight size={16} /></Link>} />

      <section className="metric-grid" aria-label="Today's traffic metrics">
        <MetricCard label="Vehicles counted" value={formatNumber(m.totalVehicles)} detail="Approaching traffic" icon={CarFront} />
        <MetricCard label="Overspeed events" value={formatNumber(m.overspeedVehicles)} detail={`${m.overspeedRate.toFixed(1)}% of traffic`} icon={Siren} tone="orange" />
        <MetricCard label="Average speed" value={`${m.averageSpeedKph}`} detail="kilometres per hour" icon={Gauge} />
        <MetricCard label="Fleet online" value={`${m.onlineDevices}/${m.totalDevices}`} detail="All assigned radars" icon={RadioTower} tone="teal" />
      </section>

      <section className="dashboard-split">
        <article className="panel reveal">
          <div className="panel-head"><div><span className="eyebrow">Traffic pulse</span><h2>Vehicles by hour</h2></div><div className="chart-legend"><span><i className="legend-total" />All traffic</span><span><i className="legend-over" />Over limit</span></div></div>
          <TrafficChart data={data.hourlyTraffic} />
        </article>
        <article className="panel maximum-panel reveal">
          <div className="panel-head"><div><span className="eyebrow">Peak reading</span><h2>Maximum speed</h2></div><Activity size={22} /></div>
          <div className="maximum-reading"><strong>{m.maximumSpeedKph}</strong><span>km/h</span></div>
          <p>Highest recorded approaching speed across the radars visible to this account today.</p>
          <Link href="/events" className="text-link">Open event register <span>→</span></Link>
        </article>
      </section>

      <section className="section-block">
        <div className="section-heading"><div><span className="eyebrow">Assigned hardware</span><h2>Radar status</h2></div><Link href="/devices" className="text-link">View fleet <span>→</span></Link></div>
        <div className="device-grid">{data.devices.map((device) => <DeviceCard key={device.id} device={device} />)}</div>
      </section>

      <section className="panel reveal section-block">
        <div className="panel-head"><div><span className="eyebrow">Evidence stream</span><h2>Recent vehicle events</h2></div><Link className="button secondary small" href="/events">All events</Link></div>
        <EventTable events={data.recentEvents} compact />
      </section>
    </>
  );
}

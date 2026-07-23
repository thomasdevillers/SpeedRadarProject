import { notFound } from "next/navigation";
import { Camera, Cpu, HardDrive, Radio, Thermometer, Wifi } from "lucide-react";
import { CommandPanel } from "@/components/command-panel";
import { EventTable } from "@/components/event-table";
import { PageHeader } from "@/components/page-header";
import { SpeedLimitControl } from "@/components/speed-limit-control";
import { StatusPill } from "@/components/status-pill";
import { formatDateTime } from "@/lib/format";
import { getDashboardData, getLatestCameraTest, getViewerContext } from "@/lib/portal-data";

export default async function DeviceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, data, viewer] = await Promise.all([params, getDashboardData(), getViewerContext()]);
  const device = data.devices.find((item) => item.id === id);
  if (!device) notFound();
  const events = data.recentEvents.filter((event) => event.deviceId === id);
  const cameraTest = viewer.role === "roadsafe_admin" ? await getLatestCameraTest(device.id) : null;
  const canManageSpeedLimit = viewer.role === "roadsafe_admin" || viewer.role === "client_admin";
  return (
    <>
      <PageHeader kicker={device.serialNumber} title={device.name} description={`${device.siteName} · ${device.organizationName ?? "Unassigned"}`} actions={<StatusPill state={device.state} />} />
      <section className="detail-grid">
        <article className="panel reveal"><div className="panel-head"><div><span className="eyebrow">Live health</span><h2>Device telemetry</h2></div><Wifi size={21} /></div><div className="telemetry-grid">
          <div><Radio /><span>Radar link</span><strong>{device.radarConnected ? "Connected" : "Fault"}</strong></div>
          <div><Camera /><span>Camera</span><strong>{device.cameraConnected ? "Ready" : "Fault"}</strong></div>
          <div><Thermometer /><span>CPU temp</span><strong>{device.cpuTemperatureC?.toFixed(1) ?? "—"} °C</strong></div>
          <div><HardDrive /><span>Disk used</span><strong>{device.diskUsedPercent ?? "—"}%</strong></div>
          <div><Cpu /><span>Agent version</span><strong>{device.softwareVersion}</strong></div>
          <div><Wifi /><span>Last heartbeat</span><strong>{formatDateTime(device.lastSeenAt)}</strong></div>
        </div></article>
        <article className="panel config-panel reveal"><div className="panel-head"><div><span className="eyebrow">Active configuration</span><h2>Site rules</h2></div></div>{canManageSpeedLimit && <SpeedLimitControl deviceId={device.id} currentLimit={device.speedLimitKph} />}<dl className="config-list"><div><dt>Speed limit</dt><dd>{device.speedLimitKph} km/h</dd></div><div><dt>Direction</dt><dd>Approaching</dd></div><div><dt>Photo rule</dt><dd>Over limit only</dd></div><div><dt>Local queue</dt><dd>{device.queueDepth} pending</dd></div></dl></article>
      </section>
      {viewer.role === "roadsafe_admin" && <section className="panel reveal section-block"><div className="panel-head"><div><span className="eyebrow">RoadSafe only</span><h2>Remote controls</h2></div></div><CommandPanel deviceId={device.id} initialCameraTest={cameraTest} /></section>}
      <section className="panel reveal section-block"><div className="panel-head"><div><span className="eyebrow">Recent activity</span><h2>Device events</h2></div></div><EventTable events={events} /></section>
    </>
  );
}

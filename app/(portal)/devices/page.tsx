import { DeviceCard } from "@/components/device-card";
import { PageHeader } from "@/components/page-header";
import { getDashboardData } from "@/lib/portal-data";

export const metadata = { title: "Radars" };

export default async function DevicesPage() {
  const { devices } = await getDashboardData();
  return (
    <>
      <PageHeader kicker="Assigned fleet" title="Speed radars" description="Connectivity, camera readiness, limits and local queue state for every radar assigned to your account." />
      <div className="toolbar"><div className="toolbar-count"><strong>{devices.length}</strong><span>assigned radar{devices.length === 1 ? "" : "s"}</span></div></div>
      <div className="device-grid wide">{devices.map((device) => <DeviceCard key={device.id} device={device} />)}</div>
    </>
  );
}

import { RadioTower } from "lucide-react";
import { AdminCreateForm } from "@/components/admin-create-form";
import { AssignmentForm } from "@/components/admin-workflows";
import { DeviceCard } from "@/components/device-card";
import { PageHeader } from "@/components/page-header";
import { getDashboardData, getOrganizations } from "@/lib/portal-data";

export const metadata = { title: "Fleet control" };

export default async function FleetPage() {
  const [{ devices }, organizations] = await Promise.all([getDashboardData(), getOrganizations()]);
  return (
    <>
      <PageHeader kicker="RoadSafe administration" title="Fleet control" description="Provision hardware, assign rentals and operate every RoadSafe radar." />
      <section className="panel reveal"><div className="panel-head"><div><span className="eyebrow">New hardware</span><h2>Provision a radar</h2></div><RadioTower /></div><AdminCreateForm kind="device" /></section>
      <section className="panel reveal section-block"><div className="panel-head"><div><span className="eyebrow">Rental control</span><h2>Assign a radar</h2></div></div><AssignmentForm organizations={organizations} devices={devices} /></section>
      <section className="section-block"><div className="section-heading"><div><span className="eyebrow">Registered devices</span><h2>{devices.length} fleet device</h2></div></div><div className="device-grid wide">{devices.map((device) => <DeviceCard key={device.id} device={device} />)}</div></section>
    </>
  );
}

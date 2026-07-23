import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, RadioTower } from "lucide-react";
import { RadarOnboardingWizard } from "@/components/radar-onboarding-wizard";
import { PageHeader } from "@/components/page-header";
import { getDashboardData, getOrganizations, getViewerContext } from "@/lib/portal-data";

export const metadata = { title: "Onboard a radar" };

export default async function RadarOnboardingPage() {
  const viewer = await getViewerContext();
  if (viewer.role !== "roadsafe_admin") redirect("/dashboard");
  const [organizations, dashboard] = await Promise.all([getOrganizations(), getDashboardData()]);

  return (
    <>
      <PageHeader
        kicker="Guided commissioning"
        title="Onboard a radar"
        description="Move new field hardware from an empty Pi to a client-owned, cloud-connected radar with live commissioning checks."
        actions={<Link className="button secondary" href="/admin/fleet"><RadioTower size={16} /> Fleet control <ArrowRight size={15} /></Link>}
      />
      <RadarOnboardingWizard
        initialOrganizations={organizations.filter((organization) => organization.status === "active")}
        existingDevices={dashboard.devices}
      />
    </>
  );
}

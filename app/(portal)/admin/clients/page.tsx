import { Building2, Users } from "lucide-react";
import { AdminCreateForm } from "@/components/admin-create-form";
import { InviteClientUserForm } from "@/components/admin-workflows";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { getOrganizations } from "@/lib/portal-data";

export const metadata = { title: "Client administration" };

export default async function ClientsPage() {
  const organizations = await getOrganizations();
  return (
    <>
      <PageHeader kicker="RoadSafe administration" title="Clients" description="Create customer organisations, invite their users and control radar assignments." />
      <section className="panel reveal"><div className="panel-head"><div><span className="eyebrow">New account</span><h2>Create a client</h2></div><Building2 /></div><AdminCreateForm kind="organization" /></section>
      <section className="panel reveal section-block"><div className="panel-head"><div><span className="eyebrow">Secure onboarding</span><h2>Invite a client user</h2></div><Users /></div><InviteClientUserForm organizations={organizations} /></section>
      <section className="panel reveal section-block"><div className="panel-head"><div><span className="eyebrow">Tenant register</span><h2>{organizations.length} organisations</h2></div></div><div className="organization-list">{organizations.map((organization) => <div className="organization-row" key={organization.id}><span className="org-mark">{organization.name.slice(0, 2).toUpperCase()}</span><div><strong>{organization.name}</strong><span><Users size={14} /> {organization.memberCount} members · {organization.deviceCount} radars</span></div><StatusPill state={organization.status === "active" ? "online" : "offline"} label={organization.status} /></div>)}</div></section>
    </>
  );
}

import { BellRing, Mail, ShieldCheck, UserRound } from "lucide-react";
import { NotificationForm } from "@/components/notification-form";
import { PageHeader } from "@/components/page-header";
import { getNotificationRecipients, getOrganizationMembers, getViewerContext } from "@/lib/portal-data";

export const metadata = { title: "Team and alerts" };

export default async function TeamPage() {
  const viewer = await getViewerContext();
  const [recipients, members] = await Promise.all([getNotificationRecipients(viewer.organizationId), getOrganizationMembers(viewer)]);
  return (
    <>
      <PageHeader kicker="Organisation settings" title="Team & alerts" description="Control who can view this organisation and who receives overspeed notifications." />
      <section className="settings-grid">
        <article className="panel reveal"><div className="panel-head"><div><span className="eyebrow">Portal access</span><h2>Organisation members</h2></div><ShieldCheck /></div>{members.map((member, index) => <div className="member-row" key={member.userId}><span className={`avatar${index ? " pale" : ""}`}>{index ? <UserRound /> : member.displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span><div><strong>{member.displayName}</strong><span>{member.email}</span></div><span className="role-chip">{member.role.replaceAll("_", " ")}</span></div>)}</article>
        <article className="panel reveal"><div className="panel-head"><div><span className="eyebrow">Delivery policy</span><h2>Overspeed alerts</h2></div><BellRing /></div><p className="panel-copy">Every processed overspeed photograph is sent from <strong>radar@roadsafe.co.za</strong> to these recipients.</p><NotificationForm organizationId={viewer.organizationId} initialRecipients={recipients} readOnly={viewer.role === "client_viewer"} /></article>
      </section>
      <section className="panel reveal section-block"><div className="delivery-note"><Mail /><div><strong>Alert delivery tracking</strong><span>Sent, delivered and bounced states are recorded against every evidence event.</span></div></div></section>
    </>
  );
}

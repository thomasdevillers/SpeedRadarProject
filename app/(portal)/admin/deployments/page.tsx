import { CheckCircle2, GitCommitHorizontal, PackageCheck, Rocket } from "lucide-react";
import { ReleaseUploadForm, RolloutForm } from "@/components/deployment-workflows";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { getDashboardData, getDeploymentData } from "@/lib/portal-data";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Deployments" };

export default async function DeploymentsPage() {
  const [{ devices }, { releases, deployments }] = await Promise.all([getDashboardData(), getDeploymentData()]);
  const current = releases[0];
  const latest = deployments[0];
  return (
    <>
      <PageHeader kicker="Signed device releases" title="Deployments" description="Roll out verified radar software with device health checks and automatic rollback." />
      <section className="release-hero panel reveal"><div><span className="eyebrow">Latest registered release</span><h2>{current ? `Version ${current.version}` : "No release registered"}</h2><p>{current?.releaseNotes || "Build and sign the first device bundle, then register it below."}</p></div><div className="release-badge"><PackageCheck /><strong>{current ? "Signed" : "Waiting"}</strong><span>{current ? "SHA-256 verified" : "No bundle"}</span></div></section>
      <section className="settings-grid section-block"><article className="panel reveal"><div className="panel-head"><div><span className="eyebrow">Release registry</span><h2>Upload a signed build</h2></div></div><ReleaseUploadForm /></article><article className="panel reveal"><div className="panel-head"><div><span className="eyebrow">Controlled rollout</span><h2>Start a canary</h2></div></div><RolloutForm devices={devices} releases={releases} /></article></section>
      <section className="panel reveal section-block"><div className="panel-head"><div><span className="eyebrow">{latest ? `${latest.deviceName} · ${formatDateTime(latest.requestedAt)}` : "No rollout yet"}</span><h2>Latest rollout</h2></div><StatusPill state={latest?.status === "healthy" ? "delivered" : latest?.status === "failed" || latest?.status === "rolled_back" ? "failed" : "pending"} label={latest?.status ?? "waiting"} /></div><div className="deployment-timeline"><div className={latest ? "done" : "active"}><CheckCircle2 /><span><strong>Bundle downloaded</strong><small>Signature and digest verified on the radar</small></span></div><div className={latest?.status === "healthy" ? "done" : "active"}><GitCommitHorizontal /><span><strong>Atomic release switch</strong><small>Previous version retained for rollback</small></span></div><div className={latest?.status === "healthy" ? "done" : "active"}><Rocket /><span><strong>{latest?.version ?? "Canary window"}</strong><small>{latest?.error || "Health result is reported by the device agent"}</small></span></div></div></section>
    </>
  );
}

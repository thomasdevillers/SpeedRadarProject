"use client";

import { useState } from "react";
import type { DeviceSummary, ReleaseSummary } from "@/lib/types";

export function ReleaseUploadForm() {
  const [message, setMessage] = useState("");
  async function submit(formData: FormData) {
    setMessage("Verifying signed release…");
    if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") { setMessage("Signed release registered"); return; }
    const response = await fetch("/api/admin/releases", { method: "POST", body: formData });
    const result = await response.json();
    setMessage(response.ok ? `Release ${result.version} registered` : result.error || "Release upload failed");
  }
  return <form action={submit} className="workflow-form release-upload-form"><label><span>Bundle (.tar.gz)</span><input name="bundle" type="file" accept=".gz,application/gzip" required /></label><label><span>Signed metadata (.json)</span><input name="metadata" type="file" accept="application/json,.json" required /></label><label><span>Release notes</span><input name="releaseNotes" placeholder="What changed?" /></label><button className="button primary" type="submit">Verify & register</button><p aria-live="polite">{message}</p></form>;
}

export function RolloutForm({ devices, releases }: { devices: DeviceSummary[]; releases: ReleaseSummary[] }) {
  const [message, setMessage] = useState("");
  async function submit(formData: FormData) {
    setMessage("Scheduling canary…");
    const payload = { deviceId: String(formData.get("deviceId")), version: String(formData.get("version")) };
    if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") { setMessage("Canary rollout scheduled"); return; }
    const response = await fetch("/api/admin/deployments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json();
    setMessage(response.ok ? "Canary rollout scheduled" : result.error || "Rollout failed");
  }
  return <form action={submit} className="workflow-form"><label><span>Radar</span><select name="deviceId" required>{devices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}</select></label><label><span>Release</span><select name="version" required>{releases.map((release) => <option key={release.version} value={release.version}>{release.version}</option>)}</select></label><button className="button primary" type="submit" disabled={!devices.length || !releases.length}>Start canary</button><p aria-live="polite">{message}</p></form>;
}

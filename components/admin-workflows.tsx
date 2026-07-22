"use client";

import { useState } from "react";
import type { DeviceSummary, OrganizationSummary } from "@/lib/types";

function defaultLocalDateTime() {
  const date = new Date(Date.now() + 5 * 60_000);
  date.setSeconds(0, 0);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function InviteClientUserForm({ organizations }: { organizations: OrganizationSummary[] }) {
  const [message, setMessage] = useState("");
  async function submit(formData: FormData) {
    setMessage("Sending invitation…");
    const payload = Object.fromEntries(formData.entries());
    if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") { await new Promise((resolve) => window.setTimeout(resolve, 450)); setMessage("Invitation sent"); return; }
    const response = await fetch("/api/admin/invitations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json();
    setMessage(response.ok ? `Invitation sent to ${result.email}` : result.error || "Invitation failed");
  }
  return (
    <form action={submit} className="workflow-form">
      <label><span>Client</span><select name="organizationId" required>{organizations.filter((item) => item.status === "active").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label><span>Name</span><input name="displayName" required placeholder="Client contact" /></label>
      <label><span>Email</span><input name="email" type="email" required placeholder="contact@client.co.za" /></label>
      <label><span>Role</span><select name="role"><option value="client_viewer">Client viewer</option><option value="client_admin">Client admin</option></select></label>
      <button className="button primary" type="submit">Send invitation</button><p aria-live="polite">{message}</p>
    </form>
  );
}

export function AssignmentForm({ organizations, devices }: { organizations: OrganizationSummary[]; devices: DeviceSummary[] }) {
  const [message, setMessage] = useState("");
  async function submit(formData: FormData) {
    setMessage("Creating assignment…");
    const localStart = String(formData.get("startsAt"));
    const payload = { deviceId: String(formData.get("deviceId")), organizationId: String(formData.get("organizationId")), siteName: String(formData.get("siteName")), speedLimitKph: Number(formData.get("speedLimitKph")), startsAt: new Date(localStart).toISOString(), endsAt: null };
    if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") { await new Promise((resolve) => window.setTimeout(resolve, 450)); setMessage("Radar assignment scheduled"); return; }
    const response = await fetch("/api/admin/assignments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json();
    setMessage(response.ok ? "Radar assignment scheduled" : result.error || "Assignment failed");
  }
  return (
    <form action={submit} className="workflow-form assignment-form">
      <label><span>Radar</span><select name="deviceId" required>{devices.map((device) => <option key={device.id} value={device.id}>{device.name} · {device.serialNumber}</option>)}</select></label>
      <label><span>Client</span><select name="organizationId" required>{organizations.filter((item) => item.status === "active").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label><span>Site name</span><input name="siteName" required placeholder="Main Road · Northbound" /></label>
      <label><span>Limit (km/h)</span><input name="speedLimitKph" type="number" min="10" max="180" defaultValue="60" required /></label>
      <label><span>Starts</span><input name="startsAt" type="datetime-local" defaultValue={defaultLocalDateTime()} required /></label>
      <button className="button primary" type="submit">Assign radar</button><p aria-live="polite">{message}</p>
    </form>
  );
}


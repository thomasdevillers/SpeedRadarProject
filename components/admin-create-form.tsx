"use client";

import { useState } from "react";

export function AdminCreateForm({ kind }: { kind: "organization" | "device" }) {
  const [message, setMessage] = useState("");
  async function submit(formData: FormData) {
    setMessage("Creating…");
    const endpoint = kind === "organization" ? "/api/admin/organizations" : "/api/admin/devices";
    const payload = Object.fromEntries(formData.entries());
    if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
      await new Promise((resolve) => window.setTimeout(resolve, 450));
      setMessage(kind === "device" ? "Device created · activation token ready" : "Client organisation created");
      return;
    }
    const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json();
    setMessage(response.ok ? (result.activationToken ? `Activation token: ${result.activationToken}` : "Created successfully") : result.error || "Request failed");
  }
  return (
    <form action={submit} className="inline-create-form">
      {kind === "organization" ? <><label><span>Client name</span><input name="name" required placeholder="Company name" /></label><button className="button primary" type="submit">Create client</button></> : <><label><span>Device name</span><input name="name" required placeholder="RSR-0002" /></label><label><span>Serial number</span><input name="serialNumber" required placeholder="RSR-2026-0002" /></label><button className="button primary" type="submit">Provision radar</button></>}
      <p aria-live="polite">{message}</p>
    </form>
  );
}


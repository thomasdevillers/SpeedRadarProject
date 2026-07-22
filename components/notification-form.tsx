"use client";

import { useState } from "react";
import { Mail, Plus, Trash2 } from "lucide-react";

export function NotificationForm({ organizationId, initialRecipients, readOnly = false }: { organizationId: string | null; initialRecipients: string[]; readOnly?: boolean }) {
  const [recipients, setRecipients] = useState(initialRecipients);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setError("");
    if (!organizationId) { setError("No organisation is selected."); return; }
    if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") {
      const response = await fetch("/api/organization/notifications", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ organizationId, recipients }) });
      if (!response.ok) { setError(await response.text()); return; }
    }
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  }
  return (
    <div>
      <div className="recipient-list">
        {recipients.map((email, index) => <div className="recipient-row" key={`${email}-${index}`}><Mail /><input aria-label={`Alert recipient ${index + 1}`} type="email" value={email} readOnly={readOnly} onChange={(event) => setRecipients((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} />{!readOnly && <button type="button" aria-label={`Remove ${email}`} onClick={() => setRecipients((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 /></button>}</div>)}
      </div>
      {readOnly ? <p className="panel-copy">Ask an organisation administrator to change alert recipients.</p> : <div className="form-actions"><button type="button" className="button secondary" onClick={() => setRecipients((current) => [...current, ""])}><Plus size={16} /> Add recipient</button><button type="button" className="button primary" onClick={save}>Save alerts</button><span className="save-message" aria-live="polite">{error || (saved ? "Saved" : "")}</span></div>}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Power, RefreshCw, RotateCcw } from "lucide-react";
import type { CommandType } from "@/lib/types";

const commands: { type: CommandType; label: string; description: string; icon: typeof Camera; dangerous?: boolean }[] = [
  { type: "capture_test", label: "Test camera", description: "Request one diagnostic frame", icon: Camera },
  { type: "sync_config", label: "Sync config", description: "Fetch current cloud settings", icon: RefreshCw },
  { type: "restart_radar", label: "Restart detector", description: "Restart the radar process", icon: RotateCcw },
  { type: "reboot_device", label: "Reboot Pi", description: "Restart the complete device", icon: Power, dangerous: true },
];

export function CommandPanel({ deviceId }: { deviceId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<CommandType | null>(null);

  async function send(type: CommandType, dangerous = false) {
    if (dangerous && !window.confirm("Reboot this radar device? Detection will briefly stop.")) return;
    setBusy(type);
    setMessage("");
    try {
      if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
      } else {
        const response = await fetch("/api/admin/commands", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ deviceId, commandType: type, payload: {} }) });
        if (!response.ok) throw new Error(await response.text());
      }
      setMessage(`${type.replaceAll("_", " ")} queued successfully.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to send command");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="command-grid">
      {commands.map(({ type, label, description, icon: Icon, dangerous }) => (
        <button key={type} className={`command-button ${dangerous ? "danger" : ""}`} onClick={() => send(type, dangerous)} disabled={busy !== null}>
          <Icon size={19} /><span><strong>{label}</strong><small>{busy === type ? "Queuing…" : description}</small></span>
        </button>
      ))}
      <p className="command-message" aria-live="polite">{message}</p>
    </div>
  );
}

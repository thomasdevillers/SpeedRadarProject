"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, ExternalLink, Power, RefreshCw, RotateCcw } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import type { CameraTestSummary, CommandType } from "@/lib/types";

const commands: { type: CommandType; label: string; description: string; icon: typeof Camera; dangerous?: boolean }[] = [
  { type: "capture_test", label: "Test camera", description: "Capture, upload and preview one frame", icon: Camera },
  { type: "sync_config", label: "Sync config", description: "Fetch current cloud settings", icon: RefreshCw },
  { type: "restart_radar", label: "Restart detector", description: "Restart the radar process", icon: RotateCcw },
  { type: "reboot_device", label: "Reboot Pi", description: "Restart the complete device", icon: Power, dangerous: true },
];

export function CommandPanel({ deviceId, initialCameraTest }: { deviceId: string; initialCameraTest: CameraTestSummary | null }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<CommandType | null>(null);
  const [cameraTest, setCameraTest] = useState(initialCameraTest);

  async function waitForCameraTest(commandId: string) {
    for (let attempt = 0; attempt < 45; attempt += 1) {
      const response = await fetch(`/api/admin/commands/${commandId}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to read camera test status");
      setCameraTest(result as CameraTestSummary);
      if (result.status === "completed") {
        if (!result.photoUrl) throw new Error("The camera test completed, but no uploaded image was returned.");
        setMessage("Test image captured and uploaded.");
        router.refresh();
        return;
      }
      if (["failed", "expired"].includes(result.status)) throw new Error(result.error || `Camera test ${result.status}.`);
      setMessage(result.status === "running" ? "Radar is capturing and uploading the frame…" : "Waiting for the radar to collect the command…");
      await new Promise((resolve) => window.setTimeout(resolve, 1000));
    }
    throw new Error("The camera test is still processing. Refresh this page in a moment.");
  }

  async function send(type: CommandType, dangerous = false) {
    if (dangerous && !window.confirm("Reboot this radar device? Detection will briefly stop.")) return;
    setBusy(type);
    setMessage(type === "capture_test" ? "Queuing camera test…" : "");
    try {
      if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        if (type === "capture_test") {
          setCameraTest({
            id: "demo-camera-test-new",
            status: "completed",
            requestedAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            capturedAt: new Date().toISOString(),
            photoUrl: "/api/demo-photo?variant=3",
            error: null,
          });
          setMessage("Test image captured and uploaded.");
        } else {
          setMessage(`${type.replaceAll("_", " ")} queued successfully.`);
        }
      } else {
        const response = await fetch("/api/admin/commands", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ deviceId, commandType: type, payload: {} }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to queue command");
        if (type === "capture_test") await waitForCameraTest(result.id);
        else setMessage(`${type.replaceAll("_", " ")} queued successfully.`);
      }
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to send command");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="command-workspace">
      <div className="command-grid">
        {commands.map(({ type, label, description, icon: Icon, dangerous }) => (
          <button key={type} className={`command-button ${dangerous ? "danger" : ""}`} onClick={() => send(type, dangerous)} disabled={busy !== null}>
            <Icon size={19} /><span><strong>{label}</strong><small>{busy === type ? (type === "capture_test" ? "Capturing & uploading…" : "Queuing…") : description}</small></span>
          </button>
        ))}
        <p className="command-message" aria-live="polite">{message}</p>
      </div>
      {cameraTest && (
        <div className="camera-test-result">
          <div className="camera-test-copy">
            <span className="eyebrow">Latest camera test</span>
            <strong>{cameraTest.status === "completed" ? "Diagnostic frame" : `Test ${cameraTest.status}`}</strong>
            <small>{formatDateTime(cameraTest.capturedAt ?? cameraTest.requestedAt)}</small>
            {cameraTest.error && <p>{cameraTest.error}</p>}
            {cameraTest.status === "completed" && !cameraTest.photoUrl && <p>This older test completed before diagnostic image uploads were enabled. Run Test camera again.</p>}
          </div>
          {cameraTest.photoUrl && (
            <a className="camera-test-photo" href={cameraTest.photoUrl} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cameraTest.photoUrl} alt={`Diagnostic camera frame captured by this radar at ${formatDateTime(cameraTest.capturedAt)}`} />
              <span><ExternalLink size={14} /> Open full image</span>
            </a>
          )}
        </div>
      )}
    </div>
  );
}

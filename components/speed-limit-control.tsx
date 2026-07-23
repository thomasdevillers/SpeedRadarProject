"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SpeedLimitControl({
  deviceId,
  currentLimit,
  compact = false,
}: {
  deviceId: string;
  currentLimit: number;
  compact?: boolean;
}) {
  const router = useRouter();
  const [speedLimit, setSpeedLimit] = useState(currentLimit);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("Updating…");
    try {
      const response = await fetch(`/api/devices/${deviceId}/speed-limit`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ speedLimitKph: speedLimit }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to update the speed limit");
      setMessage(`Updated to ${result.speedLimitKph} km/h. Sync queued.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update the speed limit");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={`speed-limit-control${compact ? " compact" : ""}`} onSubmit={submit}>
      <label>
        <span>{compact ? "Set limit" : "New speed limit"}</span>
        <span className="speed-limit-input">
          <input
            aria-label="Speed limit in kilometres per hour"
            type="number"
            min="10"
            max="180"
            inputMode="numeric"
            value={speedLimit}
            onChange={(event) => setSpeedLimit(Number(event.target.value))}
            disabled={busy}
            required
          />
          <small>km/h</small>
        </span>
      </label>
      <button className="button primary small" type="submit" disabled={busy || speedLimit === currentLimit}>
        {busy ? "Saving…" : "Apply limit"}
      </button>
      <p aria-live="polite">{message}</p>
    </form>
  );
}

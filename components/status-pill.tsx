import type { DeviceState } from "@/lib/types";

export function StatusPill({ state, label }: { state: DeviceState | "delivered" | "pending" | "failed"; label?: string }) {
  return (
    <span className={`status-pill status-${state}`}>
      <span className="status-dot" aria-hidden="true" />
      {label ?? state}
    </span>
  );
}


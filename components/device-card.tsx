import Link from "next/link";
import { Camera, Cpu, Gauge, HardDrive, RadioTower } from "lucide-react";
import { SpeedLimitControl } from "@/components/speed-limit-control";
import { StatusPill } from "@/components/status-pill";
import { timeAgo } from "@/lib/format";
import type { DeviceSummary } from "@/lib/types";

export function DeviceCard({ device, canManageSpeedLimit = false }: { device: DeviceSummary; canManageSpeedLimit?: boolean }) {
  return (
    <article className="device-card reveal">
      <div className="device-card-top">
        <div className="device-identity"><span className="device-icon"><RadioTower /></span><div><span className="eyebrow">{device.serialNumber}</span><h3>{device.name}</h3></div></div>
        <StatusPill state={device.state} />
      </div>
      <div className="device-site"><strong>{device.siteName}</strong><span>{device.organizationName ?? "Unassigned"}</span></div>
      <div className="device-stats">
        <div><Gauge size={16} /><span>Limit</span><strong>{device.speedLimitKph} km/h</strong></div>
        <div><Cpu size={16} /><span>CPU</span><strong>{device.cpuTemperatureC?.toFixed(1) ?? "—"}°C</strong></div>
        <div><HardDrive size={16} /><span>Disk</span><strong>{device.diskUsedPercent ?? "—"}%</strong></div>
        <div><Camera size={16} /><span>Camera</span><strong>{device.cameraConnected ? "Ready" : "Fault"}</strong></div>
      </div>
      {canManageSpeedLimit && <SpeedLimitControl deviceId={device.id} currentLimit={device.speedLimitKph} compact />}
      <div className="device-card-foot"><span>Seen {timeAgo(device.lastSeenAt)}</span><Link href={`/devices/${device.id}`}>Open radar <span aria-hidden="true">→</span></Link></div>
    </article>
  );
}

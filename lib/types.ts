export type UserRole = "roadsafe_admin" | "client_admin" | "client_viewer";
export type DeviceState = "online" | "degraded" | "offline" | "unassigned";
export type ProcessingState = "not_required" | "pending" | "processing" | "complete" | "failed";
export type CommandType =
  | "restart_radar"
  | "reboot_device"
  | "capture_test"
  | "sync_config"
  | "upload_diagnostics"
  | "deploy_release";

export interface OrganizationSummary {
  id: string;
  name: string;
  status: "active" | "suspended";
  memberCount: number;
  deviceCount: number;
}

export interface DeviceSummary {
  id: string;
  serialNumber: string;
  name: string;
  state: DeviceState;
  organizationName: string | null;
  siteName: string;
  speedLimitKph: number;
  lastSeenAt: string | null;
  softwareVersion: string;
  radarConnected: boolean;
  cameraConnected: boolean;
  cpuTemperatureC: number | null;
  diskUsedPercent: number | null;
  queueDepth: number;
}

export interface DeviceAssignmentSummary {
  id: string;
  deviceId: string;
  deviceName: string;
  serialNumber: string;
  organizationId: string;
  organizationName: string;
  siteName: string;
  speedLimitKph: number;
  startsAt: string;
  endsAt: string | null;
  status: "active" | "scheduled";
}

export interface RadarEvent {
  id: string;
  deviceEventId: string;
  deviceId: string;
  deviceName: string;
  organizationName: string | null;
  siteName: string;
  capturedAt: string;
  speedKph: number;
  speedLimitKph: number;
  overspeedKph: number;
  plate: string | null;
  plateRegion: string | null;
  plateScore: number | null;
  plateBox: { xmin: number; ymin: number; xmax: number; ymax: number } | null;
  photoPath: string | null;
  photoUrl?: string | null;
  photoStatus: "not_required" | "pending" | "uploaded" | "failed" | "disk_full";
  processingStatus: ProcessingState;
  emailStatus: "not_required" | "pending" | "sent" | "delivered" | "bounced" | "failed";
}

export interface DashboardMetrics {
  totalVehicles: number;
  overspeedVehicles: number;
  overspeedRate: number;
  averageSpeedKph: number;
  maximumSpeedKph: number;
  onlineDevices: number;
  totalDevices: number;
}

export interface HourlyTrafficPoint {
  hour: string;
  vehicles: number;
  overspeed: number;
}

export interface DashboardData {
  organizationName: string;
  role: UserRole;
  metrics: DashboardMetrics;
  devices: DeviceSummary[];
  recentEvents: RadarEvent[];
  hourlyTraffic: HourlyTrafficPoint[];
}

export interface ReleaseSummary {
  version: string;
  sha256: string;
  releaseNotes: string;
  createdAt: string;
}

export interface DeploymentSummary {
  id: string;
  deviceId: string;
  deviceName: string;
  version: string;
  status: "pending" | "downloading" | "verifying" | "installing" | "healthy" | "failed" | "rolled_back";
  requestedAt: string;
  completedAt: string | null;
  error: string | null;
}

import { z } from "zod";

export const activationSchema = z.object({
  token: z.string().min(40).max(300),
  hardwareModel: z.string().min(2).max(120),
  operatingSystem: z.string().min(2).max(200),
  softwareVersion: z.string().min(1).max(80),
});

export const heartbeatSchema = z.object({
  recordedAt: z.iso.datetime({ offset: true }),
  radarConnected: z.boolean(), cameraConnected: z.boolean(), radarServiceActive: z.boolean(),
  cpuTemperatureC: z.number().min(-20).max(150).nullable(), memoryUsedPercent: z.number().min(0).max(100).nullable(), diskUsedPercent: z.number().min(0).max(100).nullable(),
  queueDepth: z.number().int().min(0), lastRadarMessageAt: z.iso.datetime({ offset: true }).nullable(), lastCameraSuccessAt: z.iso.datetime({ offset: true }).nullable(),
  lastError: z.string().max(2000).nullable(), tailscaleIp: z.string().max(64).nullable(), softwareVersion: z.string().min(1).max(80), uptimeSeconds: z.number().int().min(0).nullable(),
});

export const eventSchema = z.object({
  deviceEventId: z.uuid(), capturedAt: z.iso.datetime({ offset: true }), speedKph: z.number().int().min(0).max(300), directionCode: z.enum(["A", "R"]),
  hasPhoto: z.boolean(), photoStatus: z.enum(["pending", "failed", "disk_full", "not_required"]),
});

export const commandResultSchema = z.object({
  status: z.enum(["running", "completed", "failed"]), result: z.record(z.string(), z.unknown()).optional(), error: z.string().max(4000).nullable().optional(),
});

export const organizationSchema = z.object({ name: z.string().trim().min(2).max(120) });
export const deviceSchema = z.object({ name: z.string().trim().min(2).max(80), serialNumber: z.string().trim().min(4).max(100) });
export const assignmentSchema = z.object({ deviceId: z.uuid(), organizationId: z.uuid(), siteName: z.string().trim().min(2).max(160), speedLimitKph: z.number().int().min(10).max(180), startsAt: z.iso.datetime({ offset: true }), endsAt: z.iso.datetime({ offset: true }).nullable().optional(), latitude: z.number().min(-90).max(90).nullable().optional(), longitude: z.number().min(-180).max(180).nullable().optional() });
export const commandSchema = z.object({ deviceId: z.uuid(), commandType: z.enum(["restart_radar", "reboot_device", "capture_test", "sync_config", "upload_diagnostics", "deploy_release"]), payload: z.record(z.string(), z.unknown()).default({}) });
export const invitationSchema = z.object({ organizationId: z.uuid(), email: z.email(), displayName: z.string().trim().min(2).max(120), role: z.enum(["client_admin", "client_viewer"]) });


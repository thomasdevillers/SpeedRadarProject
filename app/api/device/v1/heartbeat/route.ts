import { createAdminClient } from "@/lib/supabase/admin";
import { apiError, authenticateDevice } from "@/lib/device-auth";
import { heartbeatSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const [device, input] = await Promise.all([authenticateDevice(request), request.json().then((body) => heartbeatSchema.parse(body))]);
    const admin = createAdminClient();
    const state = !input.radarServiceActive || !input.radarConnected || !input.cameraConnected ? "degraded" : "online";
    const { error } = await admin.from("device_heartbeats").insert({ device_id: device.id, recorded_at: input.recordedAt, radar_connected: input.radarConnected, camera_connected: input.cameraConnected, radar_service_active: input.radarServiceActive, cpu_temperature_c: input.cpuTemperatureC, memory_used_percent: input.memoryUsedPercent, disk_used_percent: input.diskUsedPercent, queue_depth: input.queueDepth, last_radar_message_at: input.lastRadarMessageAt, last_camera_success_at: input.lastCameraSuccessAt, last_error: input.lastError, tailscale_ip: input.tailscaleIp, software_version: input.softwareVersion, uptime_seconds: input.uptimeSeconds });
    if (error) throw error;
    const { error: deviceError } = await admin.from("devices").update({ last_seen_at: input.recordedAt, software_version: input.softwareVersion, state }).eq("id", device.id);
    if (deviceError) throw deviceError;
    return Response.json({ ok: true, serverTime: new Date().toISOString(), state });
  } catch (error) { return apiError(error); }
}

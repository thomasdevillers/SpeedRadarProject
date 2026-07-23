import { z } from "zod";
import { requireRoadSafeAdmin } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/device-auth";
import { isDemoMode } from "@/lib/format";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [, { id: rawId }] = await Promise.all([requireRoadSafeAdmin(), params]);
    if (isDemoMode()) {
      return Response.json({
        device: { id: rawId, name: "RSR-DEMO-NEW", serialNumber: "RSR-DEMO-2026", activatedAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(), softwareVersion: "0.1.0-shadow", online: true },
        assignment: { organizationId: "00000000-0000-4000-8000-000000000010", organizationName: "RoadSafe Pilot", siteName: "Commissioning lane", speedLimitKph: 60 },
        heartbeat: { radarConnected: true, cameraConnected: true, radarServiceActive: true, queueDepth: 0, tailscaleIp: "100.64.0.22", lastError: null },
        cameraTest: null,
        latestEvent: null,
      });
    }
    const deviceId = z.uuid().parse(rawId);
    const admin = createAdminClient();
    const { data: device, error: deviceError } = await admin
      .from("devices")
      .select("id, name, serial_number, activated_at, last_seen_at, software_version")
      .eq("id", deviceId)
      .maybeSingle();
    if (deviceError) throw deviceError;
    if (!device) return Response.json({ error: "Radar not found" }, { status: 404 });

    const now = new Date().toISOString();
    const [{ data: assignments, error: assignmentError }, { data: heartbeat, error: heartbeatError }, { data: cameraTest, error: cameraError }, { data: latestEvent, error: eventError }] = await Promise.all([
      admin.from("device_assignments").select("organization_id, site_name, speed_limit_kph, organizations(name)").eq("device_id", deviceId).lte("starts_at", now).or(`ends_at.is.null,ends_at.gt.${now}`).order("starts_at", { ascending: false }).limit(1),
      admin.from("device_heartbeats").select("radar_connected, camera_connected, radar_service_active, queue_depth, tailscale_ip, last_error, recorded_at").eq("device_id", deviceId).order("recorded_at", { ascending: false }).limit(1).maybeSingle(),
      admin.from("device_commands").select("id, status, result, error, requested_at, completed_at").eq("device_id", deviceId).eq("command_type", "capture_test").order("requested_at", { ascending: false }).limit(1).maybeSingle(),
      admin.from("radar_events").select("id, captured_at, speed_kph, photo_status, processing_status, email_status").eq("device_id", deviceId).order("captured_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (assignmentError) throw assignmentError;
    if (heartbeatError) throw heartbeatError;
    if (cameraError) throw cameraError;
    if (eventError) throw eventError;

    const assignment = assignments?.[0] ?? null;
    const organization = assignment?.organizations as unknown as { name: string } | null;
    const cameraResult = (cameraTest?.result as Record<string, unknown> | null) ?? {};
    const photoPath = typeof cameraResult.photoPath === "string" ? cameraResult.photoPath : null;
    let photoUrl: string | null = null;
    if (photoPath) {
      const { data: signed, error: signedError } = await admin.storage.from("radar-photos").createSignedUrl(photoPath, 300);
      if (signedError) throw signedError;
      photoUrl = signed.signedUrl;
    }
    const lastSeen = device.last_seen_at ? new Date(device.last_seen_at).getTime() : 0;

    return Response.json({
      device: {
        id: device.id,
        name: device.name,
        serialNumber: device.serial_number,
        activatedAt: device.activated_at,
        lastSeenAt: device.last_seen_at,
        softwareVersion: device.software_version,
        online: lastSeen > Date.now() - 3 * 60_000,
      },
      assignment: assignment ? {
        organizationId: assignment.organization_id,
        organizationName: organization?.name ?? "Unknown client",
        siteName: assignment.site_name,
        speedLimitKph: assignment.speed_limit_kph,
      } : null,
      heartbeat: heartbeat ? {
        radarConnected: heartbeat.radar_connected,
        cameraConnected: heartbeat.camera_connected,
        radarServiceActive: heartbeat.radar_service_active,
        queueDepth: heartbeat.queue_depth,
        tailscaleIp: heartbeat.tailscale_ip,
        lastError: heartbeat.last_error,
        recordedAt: heartbeat.recorded_at,
      } : null,
      cameraTest: cameraTest ? {
        id: cameraTest.id,
        status: cameraTest.status,
        error: cameraTest.error,
        requestedAt: cameraTest.requested_at,
        completedAt: cameraTest.completed_at,
        photoUrl,
      } : null,
      latestEvent,
    });
  } catch (error) {
    return apiError(error);
  }
}

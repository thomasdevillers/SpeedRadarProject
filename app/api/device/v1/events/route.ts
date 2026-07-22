import { createAdminClient } from "@/lib/supabase/admin";
import { apiError, authenticateDevice } from "@/lib/device-auth";
import { eventSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const [device, input] = await Promise.all([authenticateDevice(request), request.json().then((body) => eventSchema.parse(body))]);
    const admin = createAdminClient();
    const { data: existing } = await admin.from("radar_events").select("id, photo_path, photo_status, processing_status").eq("device_id", device.id).eq("device_event_id", input.deviceEventId).maybeSingle();
    if (existing) {
      let uploadUrl: string | null = null;
      if (existing.photo_path && existing.photo_status !== "uploaded") {
        const { data } = await admin.storage.from("radar-photos").createSignedUploadUrl(existing.photo_path);
        uploadUrl = data?.signedUrl ?? null;
      }
      return Response.json({ eventId: existing.id, uploadUrl, photoPath: existing.photo_path, idempotent: true });
    }
    const capturedAt = input.capturedAt;
    const { data: assignments, error: assignmentError } = await admin.from("device_assignments").select("id, organization_id, site_name, speed_limit_kph, starts_at").eq("device_id", device.id).lte("starts_at", capturedAt).or(`ends_at.is.null,ends_at.gt.${capturedAt}`).order("starts_at", { ascending: false }).limit(1);
    if (assignmentError) throw assignmentError;
    const assignment = assignments?.[0] ?? null;
    const limit = assignment?.speed_limit_kph ?? device.defaultSpeedLimitKph;
    const overspeed = input.speedKph > limit;
    const wantsPhoto = overspeed && input.hasPhoto && input.photoStatus === "pending";
    const date = new Date(capturedAt);
    const tenantPath = assignment?.organization_id ?? "unassigned";
    const photoPath = wantsPhoto ? `raw/${tenantPath}/${device.id}/${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${String(date.getUTCDate()).padStart(2, "0")}/${input.deviceEventId}.jpg` : null;
    const photoStatus = wantsPhoto ? "pending" : overspeed ? input.photoStatus : "not_required";
    const needsProcessing = overspeed;
    const { data: event, error } = await admin.from("radar_events").insert({ device_event_id: input.deviceEventId, device_id: device.id, assignment_id: assignment?.id ?? null, organization_id: assignment?.organization_id ?? null, captured_at: capturedAt, speed_kph: input.speedKph, speed_limit_kph: limit, direction_code: input.directionCode, photo_path: photoPath, photo_status: photoStatus, processing_status: needsProcessing ? "pending" : "not_required", email_status: needsProcessing ? "pending" : "not_required" }).select("id").single();
    if (error) throw error;
    if (needsProcessing && !wantsPhoto) { const { error: queueError } = await admin.rpc("enqueue_event_processing", { p_event_id: event.id }); if (queueError) throw queueError; }
    let uploadUrl: string | null = null;
    if (photoPath) {
      const { data, error: uploadError } = await admin.storage.from("radar-photos").createSignedUploadUrl(photoPath);
      if (uploadError) throw uploadError;
      uploadUrl = data.signedUrl;
    }
    return Response.json({ eventId: event.id, uploadUrl, photoPath, speedLimitKph: limit, organizationAssigned: Boolean(assignment) }, { status: 201 });
  } catch (error) { return apiError(error); }
}

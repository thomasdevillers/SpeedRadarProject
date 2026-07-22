import { createAdminClient } from "@/lib/supabase/admin";
import { apiError, authenticateDevice } from "@/lib/device-auth";

export async function GET(request: Request) {
  try {
    const device = await authenticateDevice(request);
    const admin = createAdminClient();
    const now = new Date().toISOString();
    const { data: assignments, error: assignmentError } = await admin.from("device_assignments").select("id, organization_id, site_name, speed_limit_kph, latitude, longitude, starts_at, ends_at").eq("device_id", device.id).lte("starts_at", now).or(`ends_at.is.null,ends_at.gt.${now}`).order("starts_at", { ascending: false }).limit(1);
    if (assignmentError) throw assignmentError;
    const assignment = assignments?.[0] ?? null;
    return Response.json({ ...device.configuration, configurationVersion: new Date().toISOString(), assignment, speedLimitKph: assignment?.speed_limit_kph ?? device.defaultSpeedLimitKph, captureOverspeedOnly: true, direction: "A" });
  } catch (error) { return apiError(error); }
}

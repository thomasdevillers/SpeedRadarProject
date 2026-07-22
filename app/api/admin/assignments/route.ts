import { requireRoadSafeAdmin } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/device-auth";
import { assignmentSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const [actor, input] = await Promise.all([requireRoadSafeAdmin(), request.json().then((body) => assignmentSchema.parse(body))]);
    const admin = createAdminClient();
    const { data, error } = await admin.from("device_assignments").insert({ device_id: input.deviceId, organization_id: input.organizationId, site_name: input.siteName, speed_limit_kph: input.speedLimitKph, starts_at: input.startsAt, ends_at: input.endsAt ?? null, latitude: input.latitude ?? null, longitude: input.longitude ?? null, created_by: actor.userId }).select("*").single();
    if (error) throw error;
    await admin.from("devices").update({ state: "offline" }).eq("id", input.deviceId).eq("state", "unassigned");
    await admin.from("device_commands").insert({ device_id: input.deviceId, command_type: "sync_config", requested_by: actor.userId });
    await admin.from("audit_logs").insert({ actor_user_id: actor.userId, device_id: input.deviceId, organization_id: input.organizationId, action: "device.assigned", target_type: "assignment", target_id: data.id, details: { siteName: input.siteName, speedLimitKph: input.speedLimitKph, startsAt: input.startsAt, endsAt: input.endsAt ?? null } });
    return Response.json(data, { status: 201 });
  } catch (error) { return apiError(error); }
}


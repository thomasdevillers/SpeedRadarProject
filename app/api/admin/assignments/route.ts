import { requireRoadSafeAdmin } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/device-auth";
import { assignmentSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const [actor, input] = await Promise.all([requireRoadSafeAdmin(), request.json().then((body) => assignmentSchema.parse(body))]);
    if (new Date(input.startsAt).getTime() < Date.now() - 5 * 60_000) {
      return Response.json({ error: "Assignment start time cannot be in the past." }, { status: 400 });
    }
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("replace_device_assignment", {
      p_device_id: input.deviceId,
      p_organization_id: input.organizationId,
      p_site_name: input.siteName,
      p_speed_limit_kph: input.speedLimitKph,
      p_starts_at: input.startsAt,
      p_created_by: actor.userId,
      p_latitude: input.latitude ?? null,
      p_longitude: input.longitude ?? null,
    });
    if (error) throw error;
    await admin.from("devices").update({ state: "offline" }).eq("id", input.deviceId).eq("state", "unassigned");
    await admin.from("device_commands").insert({ device_id: input.deviceId, command_type: "sync_config", requested_by: actor.userId });
    await admin.from("audit_logs").insert({ actor_user_id: actor.userId, device_id: input.deviceId, organization_id: input.organizationId, action: data.replaced ? "device.reassigned" : "device.assigned", target_type: "assignment", target_id: data.id, details: { siteName: input.siteName, speedLimitKph: input.speedLimitKph, startsAt: input.startsAt } });
    return Response.json(data, { status: 201 });
  } catch (error) { return apiError(error); }
}

import { requireRoadSafeAdmin } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/device-auth";
import { commandSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const [actor, input] = await Promise.all([requireRoadSafeAdmin(), request.json().then((body) => commandSchema.parse(body))]);
    const admin = createAdminClient();
    const expiryMinutes = input.commandType === "deploy_release" ? 120 : 15;
    const { data, error } = await admin.from("device_commands").insert({ device_id: input.deviceId, command_type: input.commandType, payload: input.payload, requested_by: actor.userId, expires_at: new Date(Date.now() + expiryMinutes * 60_000).toISOString() }).select("id, status, requested_at").single();
    if (error) throw error;
    await admin.from("audit_logs").insert({ actor_user_id: actor.userId, device_id: input.deviceId, action: `device.command.${input.commandType}`, target_type: "device_command", target_id: data.id, details: input.payload });
    return Response.json(data, { status: 201 });
  } catch (error) { return apiError(error); }
}


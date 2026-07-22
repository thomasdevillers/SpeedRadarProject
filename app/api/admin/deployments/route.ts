import { z } from "zod";
import { requireRoadSafeAdmin } from "@/lib/authz";
import { apiError } from "@/lib/device-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({ deviceId: z.uuid(), version: z.string().regex(/^[0-9A-Za-z][0-9A-Za-z._-]{0,79}$/) });

export async function POST(request: Request) {
  try {
    const [actor, input] = await Promise.all([requireRoadSafeAdmin(), request.json().then((body) => schema.parse(body))]);
    const admin = createAdminClient();
    const { data: release } = await admin.from("device_releases").select("version").eq("version", input.version).maybeSingle();
    if (!release) return Response.json({ error: "Release not found" }, { status: 404 });
    const { data: deployment, error: deploymentError } = await admin.from("device_deployments").insert({ device_id: input.deviceId, version: input.version, requested_by: actor.userId }).select("id, status").single();
    if (deploymentError) throw deploymentError;
    const { data: command, error: commandError } = await admin.from("device_commands").insert({ device_id: input.deviceId, command_type: "deploy_release", payload: { version: input.version, deploymentId: deployment.id }, requested_by: actor.userId, expires_at: new Date(Date.now() + 120 * 60_000).toISOString() }).select("id").single();
    if (commandError) { await admin.from("device_deployments").delete().eq("id", deployment.id); throw commandError; }
    await admin.from("audit_logs").insert({ actor_user_id: actor.userId, device_id: input.deviceId, action: "deployment.created", target_type: "device_deployment", target_id: deployment.id, details: { version: input.version, commandId: command.id } });
    return Response.json({ deploymentId: deployment.id, commandId: command.id, status: deployment.status }, { status: 201 });
  } catch (error) { return apiError(error); }
}

import { createAdminClient } from "@/lib/supabase/admin";
import { apiError, authenticateDevice } from "@/lib/device-auth";
import { commandResultSchema } from "@/lib/validation";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [device, { id }, input] = await Promise.all([authenticateDevice(request), params, request.json().then((body) => commandResultSchema.parse(body))]);
    const admin = createAdminClient();
    const { data: command } = await admin.from("device_commands").select("command_type, payload").eq("id", id).eq("device_id", device.id).maybeSingle();
    if (!command) return Response.json({ error: "Command not found" }, { status: 404 });
    const values: Record<string, unknown> = { status: input.status, result: input.result ?? null, error: input.error ?? null };
    if (input.status === "running") values.started_at = new Date().toISOString(); else values.completed_at = new Date().toISOString();
    const { data, error } = await admin.from("device_commands").update(values).eq("id", id).eq("device_id", device.id).select("id").maybeSingle();
    if (error) throw error;
    if (!data) return Response.json({ error: "Command not found" }, { status: 404 });
    if (command.command_type === "deploy_release") {
      const deploymentId = (command.payload as Record<string, unknown> | null)?.deploymentId;
      if (typeof deploymentId === "string") {
        const deploymentStatus = input.status === "running" ? "installing" : input.status === "completed" ? "healthy" : (input.result as Record<string, unknown> | undefined)?.rolledBack ? "rolled_back" : "failed";
        await admin.from("device_deployments").update({ status: deploymentStatus, completed_at: input.status === "running" ? null : new Date().toISOString(), error: input.error ?? null }).eq("id", deploymentId).eq("device_id", device.id);
      }
    }
    return Response.json({ ok: true });
  } catch (error) { return apiError(error); }
}

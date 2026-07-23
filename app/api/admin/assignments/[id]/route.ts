import { z } from "zod";
import { requireRoadSafeAdmin } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/device-auth";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [actor, { id }] = await Promise.all([requireRoadSafeAdmin(), params]);
    const assignmentId = z.uuid().parse(id);
    const admin = createAdminClient();
    const endedAt = new Date().toISOString();
    const { data, error } = await admin.rpc("end_device_assignment", { p_assignment_id: assignmentId, p_ended_at: endedAt });
    if (error) throw error;

    const { data: activeAssignment } = await admin
      .from("device_assignments")
      .select("id")
      .eq("device_id", data.deviceId)
      .lte("starts_at", endedAt)
      .or(`ends_at.is.null,ends_at.gt.${endedAt}`)
      .limit(1)
      .maybeSingle();

    if (!activeAssignment) await admin.from("devices").update({ state: "unassigned" }).eq("id", data.deviceId);
    await admin.from("device_commands").insert({ device_id: data.deviceId, command_type: "sync_config", requested_by: actor.userId });
    await admin.from("audit_logs").insert({
      actor_user_id: actor.userId,
      device_id: data.deviceId,
      organization_id: data.organizationId,
      action: data.action === "cancelled" ? "device.assignment_cancelled" : "device.unassigned",
      target_type: "assignment",
      target_id: assignmentId,
      details: { endedAt },
    });
    return Response.json(data);
  } catch (error) {
    return apiError(error);
  }
}

import { createAdminClient } from "@/lib/supabase/admin";
import { apiError, authenticateDevice } from "@/lib/device-auth";

export async function GET(request: Request) {
  try {
    const device = await authenticateDevice(request);
    const admin = createAdminClient();
    const now = new Date().toISOString();
    await admin.from("device_commands").update({ status: "expired", completed_at: now }).eq("device_id", device.id).in("status", ["pending", "delivered"]).lt("expires_at", now);
    const { data, error } = await admin.from("device_commands").select("id, command_type, payload, status, requested_at, expires_at").eq("device_id", device.id).in("status", ["pending", "delivered"]).gt("expires_at", now).order("requested_at").limit(10);
    if (error) throw error;
    const pendingIds = (data ?? []).filter((item) => item.status === "pending").map((item) => item.id);
    if (pendingIds.length) { const { error: deliveryError } = await admin.from("device_commands").update({ status: "delivered", delivered_at: now }).in("id", pendingIds); if (deliveryError) throw deliveryError; }
    return Response.json({ commands: (data ?? []).map((item) => ({ id: item.id, type: item.command_type, payload: item.payload, requestedAt: item.requested_at, expiresAt: item.expires_at })) });
  } catch (error) { return apiError(error); }
}

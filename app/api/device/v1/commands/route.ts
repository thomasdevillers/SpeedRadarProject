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
    const commands = await Promise.all((data ?? []).map(async (item) => {
      let payload = (item.payload as Record<string, unknown> | null) ?? {};
      if (item.command_type === "capture_test") {
        const photoPath = `diagnostics/unassigned/${device.id}/${item.id}.jpg`;
        const { data: upload, error: uploadError } = await admin.storage.from("radar-photos").createSignedUploadUrl(photoPath);
        if (uploadError) throw uploadError;
        payload = { ...payload, photoPath, photoUploadUrl: upload.signedUrl };
      }
      return { id: item.id, type: item.command_type, payload, requestedAt: item.requested_at, expiresAt: item.expires_at };
    }));
    return Response.json({ commands });
  } catch (error) { return apiError(error); }
}

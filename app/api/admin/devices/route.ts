import { requireRoadSafeAdmin } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/device-auth";
import { hashSecret, randomSecret } from "@/lib/security";
import { deviceSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const [actor, input] = await Promise.all([requireRoadSafeAdmin(), request.json().then((body) => deviceSchema.parse(body))]);
    const admin = createAdminClient();
    const { data: device, error } = await admin.from("devices").insert({ name: input.name, serial_number: input.serialNumber }).select("id, name, serial_number").single();
    if (error) throw error;
    const secret = randomSecret();
    const { error: tokenError } = await admin.from("device_activation_tokens").insert({ device_id: device.id, token_hash: hashSecret(secret), expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), created_by: actor.userId });
    if (tokenError) { await admin.from("devices").delete().eq("id", device.id); throw tokenError; }
    await admin.from("audit_logs").insert({ actor_user_id: actor.userId, device_id: device.id, action: "device.provisioned", target_type: "device", target_id: device.id, details: { serialNumber: device.serial_number } });
    return Response.json({ device, activationToken: `${device.id}.${secret}`, expiresInHours: 24 }, { status: 201 });
  } catch (error) { return apiError(error); }
}

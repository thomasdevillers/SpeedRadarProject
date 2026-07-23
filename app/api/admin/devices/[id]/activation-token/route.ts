import { z } from "zod";
import { requireRoadSafeAdmin } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/device-auth";
import { isDemoMode } from "@/lib/format";
import { hashSecret, randomSecret } from "@/lib/security";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [actor, { id: rawId }] = await Promise.all([requireRoadSafeAdmin(), params]);
    if (isDemoMode()) {
      return Response.json({ activationToken: `${rawId}.${"demo-onboarding-token".padEnd(48, "x")}`, expiresInHours: 24 });
    }
    const deviceId = z.uuid().parse(rawId);
    const admin = createAdminClient();
    const { data: device, error: deviceError } = await admin.from("devices").select("id, activated_at").eq("id", deviceId).maybeSingle();
    if (deviceError) throw deviceError;
    if (!device) return Response.json({ error: "Radar not found" }, { status: 404 });
    if (device.activated_at) return Response.json({ error: "This radar is already activated." }, { status: 409 });

    const secret = randomSecret();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { error: revokeError } = await admin
      .from("device_activation_tokens")
      .update({ used_at: new Date().toISOString() })
      .eq("device_id", deviceId)
      .is("used_at", null);
    if (revokeError) throw revokeError;
    const { error: tokenError } = await admin.from("device_activation_tokens").insert({
      device_id: deviceId,
      token_hash: hashSecret(secret),
      expires_at: expiresAt,
      created_by: actor.userId,
    });
    if (tokenError) throw tokenError;
    await admin.from("audit_logs").insert({
      actor_user_id: actor.userId,
      device_id: deviceId,
      action: "device.activation_token_reissued",
      target_type: "device",
      target_id: deviceId,
      details: { expiresAt },
    });
    return Response.json({ activationToken: `${deviceId}.${secret}`, expiresInHours: 24 });
  } catch (error) {
    return apiError(error);
  }
}

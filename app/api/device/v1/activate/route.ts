import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/device-auth";
import { activationSchema } from "@/lib/validation";
import { hashSecret, randomSecret, safeHashEquals } from "@/lib/security";

export async function POST(request: Request) {
  try {
    const input = activationSchema.parse(await request.json());
    const [deviceId, providedSecret] = input.token.split(".", 2);
    if (!deviceId || !providedSecret) return Response.json({ error: "Invalid activation token" }, { status: 400 });
    const admin = createAdminClient();
    const { data: tokens } = await admin.from("device_activation_tokens").select("id, token_hash, device_id, expires_at, used_at").eq("device_id", deviceId).is("used_at", null);
    const token = tokens?.find((candidate) => new Date(candidate.expires_at) > new Date() && safeHashEquals(candidate.token_hash, providedSecret));
    if (!token) return Response.json({ error: "Activation token is invalid or expired" }, { status: 401 });
    const deviceSecret = randomSecret();
    const { error: activationError } = await admin.rpc("activate_device", { p_activation_token_id: token.id, p_device_id: deviceId, p_secret_hash: hashSecret(deviceSecret), p_hardware_model: input.hardwareModel, p_operating_system: input.operatingSystem, p_software_version: input.softwareVersion });
    if (activationError) throw activationError;
    return Response.json({ deviceId, deviceSecret, apiBaseUrl: process.env.DEVICE_API_BASE_URL ?? new URL(request.url).origin, heartbeatIntervalSeconds: 60, commandPollSeconds: 15 });
  } catch (error) { return apiError(error); }
}

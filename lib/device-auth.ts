import { createAdminClient } from "@/lib/supabase/admin";
import { safeHashEquals } from "@/lib/security";
import { ZodError } from "zod";

export interface AuthenticatedDevice {
  id: string;
  name: string;
  serialNumber: string;
  defaultSpeedLimitKph: number;
  configuration: Record<string, unknown>;
}

export async function authenticateDevice(request: Request): Promise<AuthenticatedDevice> {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Device ([0-9a-f-]{36})\.([A-Za-z0-9_-]{30,})$/.exec(header);
  if (!match) throw new Response("Invalid device authorization", { status: 401 });
  const [, deviceId, secret] = match;
  const admin = createAdminClient();
  const { data: credential } = await admin.from("device_credentials").select("id, secret_hash, device_id").eq("device_id", deviceId).is("revoked_at", null).maybeSingle();
  if (!credential || !safeHashEquals(credential.secret_hash, secret)) throw new Response("Invalid device credential", { status: 401 });
  const { data: device } = await admin.from("devices").select("id, name, serial_number, default_speed_limit_kph, configuration, revoked_at").eq("id", deviceId).single();
  if (!device || device.revoked_at) throw new Response("Device is revoked", { status: 403 });
  await admin.from("device_credentials").update({ last_used_at: new Date().toISOString() }).eq("id", credential.id);
  return { id: device.id, name: device.name, serialNumber: device.serial_number, defaultSpeedLimitKph: device.default_speed_limit_kph, configuration: device.configuration ?? {} };
}

export function apiError(error: unknown): Response {
  if (error instanceof Response) return error;
  console.error(error);
  if (error instanceof ZodError) return Response.json({ error: "Invalid request", issues: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) }, { status: 400 });
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  const message = typeof error === "object" && error !== null && "message" in error ? String(error.message) : "Request could not be completed";
  if (["23505", "23P01"].includes(code)) return Response.json({ error: message }, { status: 409 });
  if (["23503", "23514", "22P02"].includes(code)) return Response.json({ error: message }, { status: 400 });
  return Response.json({ error: "Request could not be completed" }, { status: 500 });
}

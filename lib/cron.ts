import { safeTextEquals } from "@/lib/security";
import { createAdminClient } from "@/lib/supabase/admin";

export function authorizeCron(request: Request): Response | null {
  const expected = process.env.CRON_SECRET;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected) return Response.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  if (!safeTextEquals(expected, provided)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}

export async function invokeInternalFunction(name: "process-events" | "retention") {
  const secret = process.env.INTERNAL_JOB_SECRET;
  if (!secret) throw new Error("INTERNAL_JOB_SECRET is not configured");
  const admin = createAdminClient();
  const { data, error } = await admin.functions.invoke(name, { body: {}, headers: { "x-internal-job-secret": secret } });
  if (error) throw error;
  return data;
}

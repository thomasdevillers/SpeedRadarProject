import { z } from "zod";
import { requireRoadSafeAdmin } from "@/lib/authz";
import { apiError } from "@/lib/device-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [, { id }] = await Promise.all([requireRoadSafeAdmin(), params]);
    const commandId = z.uuid().parse(id);
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("device_commands")
      .select("id, command_type, status, requested_at, completed_at, result, error")
      .eq("id", commandId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return Response.json({ error: "Command not found" }, { status: 404 });
    const result = (data.result as Record<string, unknown> | null) ?? {};
    const photoPath = data.command_type === "capture_test" && typeof result.photoPath === "string" ? result.photoPath : null;
    let photoUrl: string | null = null;
    if (photoPath) {
      const { data: signed, error: signedError } = await admin.storage.from("radar-photos").createSignedUrl(photoPath, 300);
      if (signedError) throw signedError;
      photoUrl = signed.signedUrl;
    }
    return Response.json({
      id: data.id,
      status: data.status,
      requestedAt: data.requested_at,
      completedAt: data.completed_at,
      capturedAt: typeof result.capturedAt === "string" ? result.capturedAt : null,
      photoUrl,
      error: data.error,
    });
  } catch (error) {
    return apiError(error);
  }
}

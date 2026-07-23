import { z } from "zod";
import { requireRoadSafeAdmin } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/device-auth";
import { isDemoMode } from "@/lib/format";

const schema = z.object({ email: z.email() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [actor, { id: rawId }, input] = await Promise.all([
      requireRoadSafeAdmin(),
      params,
      request.json().then((body) => schema.parse(body)),
    ]);
    if (isDemoMode()) return Response.json({ email: input.email.toLowerCase(), added: true });
    const organizationId = z.uuid().parse(rawId);
    const email = input.email.toLowerCase();
    const admin = createAdminClient();
    const { data: organization, error: organizationError } = await admin.from("organizations").select("id").eq("id", organizationId).maybeSingle();
    if (organizationError) throw organizationError;
    if (!organization) return Response.json({ error: "Client organisation not found" }, { status: 404 });
    const { error } = await admin.from("notification_recipients").upsert({
      organization_id: organizationId,
      email,
      enabled: true,
      created_by: actor.userId,
    }, { onConflict: "organization_id,email" });
    if (error) throw error;
    await admin.from("audit_logs").insert({
      actor_user_id: actor.userId,
      organization_id: organizationId,
      action: "notification_recipient.added",
      target_type: "organization",
      target_id: organizationId,
      details: { email, source: "radar_onboarding" },
    });
    return Response.json({ email, added: true });
  } catch (error) {
    return apiError(error);
  }
}

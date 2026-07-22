import { requireRoadSafeAdmin } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/device-auth";
import { invitationSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const [actor, input] = await Promise.all([requireRoadSafeAdmin(), request.json().then((body) => invitationSchema.parse(body))]);
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.inviteUserByEmail(input.email.toLowerCase(), { data: { name: input.displayName }, redirectTo: `${process.env.DEVICE_API_BASE_URL ?? new URL(request.url).origin}/auth/callback` });
    if (error) throw error;
    if (!data.user) throw new Error("Invitation did not create a user");
    const { error: membershipError } = await admin.from("organization_members").upsert({ organization_id: input.organizationId, user_id: data.user.id, role: input.role });
    if (membershipError) { await admin.auth.admin.deleteUser(data.user.id); throw membershipError; }
    await admin.from("audit_logs").insert({ actor_user_id: actor.userId, organization_id: input.organizationId, action: "user.invited", target_type: "user", target_id: data.user.id, details: { email: input.email.toLowerCase(), role: input.role } });
    return Response.json({ userId: data.user.id, email: input.email.toLowerCase(), invited: true }, { status: 201 });
  } catch (error) { return apiError(error); }
}

import { requireRoadSafeAdmin } from "@/lib/authz";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/device-auth";
import { slugify } from "@/lib/security";
import { organizationSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const [actor, input] = await Promise.all([requireRoadSafeAdmin(), request.json().then((body) => organizationSchema.parse(body))]);
    const admin = createAdminClient();
    const baseSlug = slugify(input.name);
    let slug = baseSlug;
    const { data: found } = await admin.from("organizations").select("slug").like("slug", `${baseSlug}%`);
    if (found?.some((item) => item.slug === slug)) slug = `${baseSlug}-${found.length + 1}`;
    const { data, error } = await admin.from("organizations").insert({ name: input.name, slug }).select("id, name, slug, status").single();
    if (error) throw error;
    await admin.from("audit_logs").insert({ actor_user_id: actor.userId, organization_id: data.id, action: "organization.created", target_type: "organization", target_id: data.id, details: { name: data.name } });
    return Response.json(data, { status: 201 });
  } catch (error) { return apiError(error); }
}


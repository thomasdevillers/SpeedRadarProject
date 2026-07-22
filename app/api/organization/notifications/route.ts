import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/device-auth";

const schema = z.object({ organizationId: z.uuid(), recipients: z.array(z.email()).max(50) });

export async function PUT(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });
    const { error } = await supabase.rpc("replace_notification_recipients", { p_organization_id: input.organizationId, p_emails: input.recipients.map((email) => email.toLowerCase()) });
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (error) { return apiError(error); }
}

import { createClient } from "npm:@supabase/supabase-js@2.110.8";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const webhookSecret = Deno.env.get("BREVO_WEBHOOK_SECRET")!;

Deno.serve(async (request) => {
  const url = new URL(request.url);
  if ((request.headers.get("x-brevo-webhook-secret") ?? url.searchParams.get("secret")) !== webhookSecret) return new Response("Unauthorized", { status: 401 });
  const payload = await request.json();
  const messageId = payload["message-id"] ?? payload.messageId;
  const event = String(payload.event ?? "").toLowerCase();
  if (!messageId) return Response.json({ ok: true, ignored: true });
  const status = event === "delivered" ? "delivered" : ["hard_bounce", "soft_bounce", "blocked", "invalid_email"].includes(event) ? "bounced" : event === "error" ? "failed" : null;
  if (status) await supabase.from("radar_events").update({ email_status: status, email_error: status === "delivered" ? null : event }).eq("email_message_id", messageId);
  return Response.json({ ok: true });
});

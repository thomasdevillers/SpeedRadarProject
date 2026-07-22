import { createClient } from "npm:@supabase/supabase-js@2.110.8";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const plateToken = Deno.env.get("PLATE_RECOGNIZER_API_TOKEN")!;
const brevoKey = Deno.env.get("BREVO_API_KEY")!;
const internalSecret = Deno.env.get("INTERNAL_JOB_SECRET")!;
const senderEmail = Deno.env.get("ALERT_EMAIL_FROM") ?? "radar@roadsafe.co.za";

type QueueMessage = { msg_id: number; read_ct: number; message: { event_id: string } };

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary);
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

async function recognizePlate(image: Blob) {
  const body = new FormData();
  body.append("upload", image, "radar-event.jpg");
  body.append("regions", "za");
  body.append("config", JSON.stringify({ region: "strict" }));
  const response = await fetch("https://api.platerecognizer.com/v1/plate-reader/", { method: "POST", headers: { authorization: `Token ${plateToken}` }, body });
  if (!response.ok) throw new Error(`Plate Recognizer returned ${response.status}`);
  const payload = await response.json();
  const candidates = (payload.results ?? []).filter((item: Record<string, number>) => Number(item.score ?? 0) >= .3 && Number(item.dscore ?? 0) >= .3);
  candidates.sort((a: Record<string, number>, b: Record<string, number>) => Number(b.score) - Number(a.score) || Number(b.dscore) - Number(a.dscore));
  const best = candidates[0];
  if (!best) return { plate: null, plate_region: null, plate_score: null, plate_dscore: null, plate_box: null };
  return { plate: String(best.plate ?? "").toUpperCase(), plate_region: best.region?.code ?? null, plate_score: Number(best.score ?? 0), plate_dscore: Number(best.dscore ?? 0), plate_box: best.box ?? null };
}

async function sendAlert(event: Record<string, any>, recipients: string[], photoBytes: Uint8Array | null) {
  const plate = event.plate || "PLATE UNAVAILABLE";
  const radarName = escapeHtml(event.devices.name);
  const siteName = escapeHtml(event.device_assignments?.site_name ?? "Unassigned");
  const safePlate = escapeHtml(plate);
  const body = {
    sender: { name: "RoadSafe Radar", email: senderEmail },
    to: recipients.map((email) => ({ email })),
    subject: `[RoadSafe] ${event.speed_kph} km/h in ${event.speed_limit_kph} km/h zone · ${plate}`,
    htmlContent: `<div style="font-family:Arial,sans-serif;color:#111817"><h1 style="font-size:24px">Overspeed event detected</h1><table cellpadding="7" style="border-collapse:collapse"><tr><td><b>Captured</b></td><td>${new Date(event.captured_at).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg" })}</td></tr><tr><td><b>Radar</b></td><td>${radarName}</td></tr><tr><td><b>Site</b></td><td>${siteName}</td></tr><tr><td><b>Speed</b></td><td>${event.speed_kph} km/h</td></tr><tr><td><b>Limit</b></td><td>${event.speed_limit_kph} km/h</td></tr><tr><td><b>Over by</b></td><td style="color:#ca3d11"><b>+${event.overspeed_kph} km/h</b></td></tr><tr><td><b>Plate</b></td><td>${safePlate}</td></tr></table><p style="color:#68736f;font-size:12px">Event ${escapeHtml(event.device_event_id)}</p></div>`,
    headers: { "X-RoadSafe-Event-ID": event.id },
    ...(photoBytes ? { attachment: [{ content: base64(photoBytes), name: `${event.device_event_id}.jpg` }] } : {}),
  };
  const response = await fetch("https://api.brevo.com/v3/smtp/email", { method: "POST", headers: { "api-key": brevoKey, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Brevo returned ${response.status}: ${await response.text()}`);
  return response.json() as Promise<{ messageId: string }>;
}

async function processMessage(item: QueueMessage) {
  const eventId = item.message.event_id;
  const { data: event, error } = await supabase.from("radar_events").select("*, devices(name), device_assignments(site_name)").eq("id", eventId).single();
  if (error || !event) { await supabase.rpc("complete_event_processing", { p_msg_id: item.msg_id }); return; }
  if (["sent", "delivered"].includes(event.email_status)) { await supabase.rpc("complete_event_processing", { p_msg_id: item.msg_id }); return; }
  await supabase.from("radar_events").update({ processing_status: "processing" }).eq("id", eventId);

  let photoBytes: Uint8Array | null = null;
  let processingFailed = false;
  if (event.photo_path && event.photo_status === "uploaded") {
    const { data: photo, error: photoError } = await supabase.storage.from("radar-photos").download(event.photo_path);
    if (photoError) throw photoError;
    photoBytes = new Uint8Array(await photo.arrayBuffer());
    if (!event.plate && event.ocr_attempts < 3) {
      try {
        const plate = await recognizePlate(photo);
        Object.assign(event, plate);
        await supabase.from("radar_events").update({ ...plate, ocr_attempts: event.ocr_attempts + 1, ocr_error: null }).eq("id", eventId);
      } catch (recognitionError) {
        const attempts = event.ocr_attempts + 1;
        await supabase.from("radar_events").update({ ocr_attempts: attempts, ocr_error: String(recognitionError), processing_status: attempts >= 3 ? "failed" : "pending" }).eq("id", eventId);
        if (attempts < 3) return;
        processingFailed = true;
      }
    }
  }

  if (!event.organization_id) {
    await supabase.from("radar_events").update({ processing_status: processingFailed ? "failed" : "complete", email_status: "not_required" }).eq("id", eventId);
    await supabase.rpc("complete_event_processing", { p_msg_id: item.msg_id });
    return;
  }
  const { data: recipientRows } = await supabase.from("notification_recipients").select("email").eq("organization_id", event.organization_id).eq("enabled", true);
  const recipients = (recipientRows ?? []).map((row) => row.email);
  if (!recipients.length) {
    await supabase.from("radar_events").update({ processing_status: event.plate ? "complete" : "failed", email_status: "failed", email_error: "No enabled alert recipients" }).eq("id", eventId);
    await supabase.rpc("complete_event_processing", { p_msg_id: item.msg_id });
    return;
  }
  const sent = await sendAlert(event, recipients, photoBytes);
  await supabase.from("radar_events").update({ processing_status: processingFailed ? "failed" : "complete", email_status: "sent", email_message_id: sent.messageId, email_error: null }).eq("id", eventId);
  await supabase.rpc("complete_event_processing", { p_msg_id: item.msg_id });
}

Deno.serve(async (request) => {
  if (request.headers.get("x-internal-job-secret") !== internalSecret) return new Response("Unauthorized", { status: 401 });
  const { data, error } = await supabase.rpc("dequeue_event_processing");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  let completed = 0;
  for (const item of (data ?? []) as QueueMessage[]) {
    try { await processMessage(item); completed += 1; }
    catch (error) {
      console.error("Event processing failed", item.message.event_id, error);
      await supabase.from("radar_events").update({ processing_status: "pending", email_error: String(error) }).eq("id", item.message.event_id);
    }
  }
  return Response.json({ dequeued: data?.length ?? 0, completed });
});

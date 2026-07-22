import { createAdminClient } from "@/lib/supabase/admin";
import { apiError, authenticateDevice } from "@/lib/device-auth";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const [device, { id }] = await Promise.all([authenticateDevice(request), params]);
    const admin = createAdminClient();
    const { data: event } = await admin.from("radar_events").select("id, photo_path, photo_status, processing_status").eq("id", id).eq("device_id", device.id).maybeSingle();
    if (!event) return Response.json({ error: "Event not found" }, { status: 404 });
    if (!event.photo_path) return Response.json({ error: "Event does not expect a photograph" }, { status: 409 });
    if (event.photo_status === "uploaded") return Response.json({ ok: true, processingStatus: event.processing_status, idempotent: true });
    const { error: updateError } = await admin.from("radar_events").update({ photo_status: "uploaded", processing_status: "pending" }).eq("id", id);
    if (updateError) throw updateError;
    const { error: queueError } = await admin.rpc("enqueue_event_processing", { p_event_id: id });
    if (queueError) throw queueError;
    return Response.json({ ok: true, processingStatus: "pending", idempotent: false });
  } catch (error) { return apiError(error); }
}

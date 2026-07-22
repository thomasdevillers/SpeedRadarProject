import { createAdminClient } from "@/lib/supabase/admin";
import { apiError, authenticateDevice } from "@/lib/device-auth";

export async function GET(request: Request, { params }: { params: Promise<{ version: string }> }) {
  try {
    const [device, { version }] = await Promise.all([authenticateDevice(request), params]);
    const admin = createAdminClient();
    const { data: deployment } = await admin.from("device_deployments").select("id, status").eq("device_id", device.id).eq("version", version).in("status", ["pending", "downloading", "verifying"]).order("requested_at", { ascending: false }).limit(1).maybeSingle();
    if (!deployment) return Response.json({ error: "No active deployment for this device" }, { status: 404 });
    const { data: release } = await admin.from("device_releases").select("version, bundle_path, sha256, signature, manifest").eq("version", version).single();
    if (!release) return Response.json({ error: "Release not found" }, { status: 404 });
    const { data, error } = await admin.storage.from("device-releases").createSignedUrl(release.bundle_path, 600);
    if (error) throw error;
    const { error: deploymentError } = await admin.from("device_deployments").update({ status: "downloading", started_at: new Date().toISOString() }).eq("id", deployment.id);
    if (deploymentError) throw deploymentError;
    return Response.json({ ...release, downloadUrl: data.signedUrl, deploymentId: deployment.id });
  } catch (error) { return apiError(error); }
}

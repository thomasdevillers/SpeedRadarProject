import { createHash, createPublicKey, verify } from "node:crypto";
import { requireRoadSafeAdmin } from "@/lib/authz";
import { apiError } from "@/lib/device-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

export async function POST(request: Request) {
  try {
    const actor = await requireRoadSafeAdmin();
    const form = await request.formData();
    const bundle = form.get("bundle");
    const metadataFile = form.get("metadata");
    const releaseNotes = String(form.get("releaseNotes") ?? "").slice(0, 4000);
    if (!(bundle instanceof File) || !(metadataFile instanceof File)) return Response.json({ error: "Bundle and signed metadata files are required" }, { status: 400 });
    if (bundle.size < 1 || bundle.size > 4_000_000) return Response.json({ error: "Release bundle must be between 1 byte and 4 MB" }, { status: 400 });
    const signed = JSON.parse(await metadataFile.text()) as { manifest?: Record<string, unknown>; signature?: string; bundle?: string };
    const version = String(signed.manifest?.version ?? "");
    const expectedHash = String(signed.manifest?.sha256 ?? "");
    const signature = String(signed.signature ?? "");
    if (!/^[0-9A-Za-z][0-9A-Za-z._-]{0,79}$/.test(version) || !/^[a-f0-9]{64}$/.test(expectedHash) || !/^[a-f0-9]{128}$/.test(signature)) return Response.json({ error: "Signed release metadata is invalid" }, { status: 400 });
    const bytes = Buffer.from(await bundle.arrayBuffer());
    const actualHash = createHash("sha256").update(bytes).digest("hex");
    if (actualHash !== expectedHash) return Response.json({ error: "Bundle SHA-256 does not match its manifest" }, { status: 400 });
    const encodedKey = process.env.ROADSAFE_RELEASE_PUBLIC_KEY_B64;
    if (!encodedKey) throw new Error("Release verification key is not configured");
    const publicKey = createPublicKey(Buffer.from(encodedKey, "base64"));
    if (publicKey.asymmetricKeyType !== "ed25519" || !verify(null, Buffer.from(canonicalJson(signed.manifest)), publicKey, Buffer.from(signature, "hex"))) return Response.json({ error: "Release signature is invalid" }, { status: 400 });
    const admin = createAdminClient();
    const bundlePath = `releases/${version}/roadsafe-radar-${version}.tar.gz`;
    const { error: uploadError } = await admin.storage.from("device-releases").upload(bundlePath, bytes, { contentType: "application/gzip", upsert: false });
    if (uploadError) throw uploadError;
    const { error: recordError } = await admin.from("device_releases").insert({ version, bundle_path: bundlePath, sha256: actualHash, signature, manifest: signed.manifest, release_notes: releaseNotes, created_by: actor.userId });
    if (recordError) { await admin.storage.from("device-releases").remove([bundlePath]); throw recordError; }
    await admin.from("audit_logs").insert({ actor_user_id: actor.userId, action: "release.created", target_type: "device_release", target_id: version, details: { sha256: actualHash } });
    return Response.json({ version, sha256: actualHash }, { status: 201 });
  } catch (error) { return apiError(error); }
}

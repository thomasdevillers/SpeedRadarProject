import sharp from "sharp";
import { getEventById } from "@/lib/portal-data";
import { buildEvidenceBanner } from "@/lib/evidence-image";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await getEventById(id);
  if (!event) return new Response("Event not found", { status: 404 });
  if (!event.photoUrl) return new Response("This event has no evidence photograph", { status: 404 });

  const photoUrl = new URL(event.photoUrl, request.url);
  const photoResponse = await fetch(photoUrl, { cache: "no-store" });
  if (!photoResponse.ok) return new Response("Unable to load the evidence photograph", { status: 502 });

  const photograph = await sharp(Buffer.from(await photoResponse.arrayBuffer()))
    .rotate()
    .resize({ width: 1600, withoutEnlargement: false })
    .jpeg({ quality: 92 })
    .toBuffer();
  const metadata = await sharp(photograph).metadata();
  const width = metadata.width ?? 1600;
  const height = metadata.height ?? 900;
  const bannerHeight = 300;

  const evidence = await sharp({
    create: {
      width,
      height: height + bannerHeight,
      channels: 3,
      background: "#111817",
    },
  })
    .composite([
      { input: photograph, top: 0, left: 0 },
      { input: buildEvidenceBanner(event, width, bannerHeight), top: height, left: 0 },
    ])
    .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
    .toBuffer();

  const filename = `roadsafe-${event.deviceEventId}.jpg`;
  return new Response(new Uint8Array(evidence), {
    headers: {
      "content-type": "image/jpeg",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "private, no-store",
    },
  });
}

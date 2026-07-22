import { getEvents } from "@/lib/portal-data";

function csv(value: unknown): string {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET() {
  const events = [];
  for (let offset = 0; offset < 100_000; offset += 1000) {
    const page = await getEvents(1000, offset);
    events.push(...page);
    if (page.length < 1000) break;
  }
  const headings = ["captured_at", "device", "site", "speed_kph", "limit_kph", "overspeed_kph", "plate", "ocr_confidence", "photo_status", "email_status", "event_id"];
  const rows = events.map((event) => [event.capturedAt, event.deviceName, event.siteName, event.speedKph, event.speedLimitKph, event.overspeedKph, event.plate, event.plateScore, event.photoStatus, event.emailStatus, event.deviceEventId].map(csv).join(","));
  const content = [headings.map(csv).join(","), ...rows].join("\r\n") + "\r\n";
  const date = new Date().toISOString().slice(0, 10);
  return new Response(content, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="roadsafe-events-${date}.csv"`, "cache-control": "private, no-store" } });
}
